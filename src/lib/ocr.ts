import { query } from '@/lib/db'

/**
 * Optional OCR for the uploaded Form 34A photo.
 *
 * The platform is deployed without an OCR provider most of the time, so OCR
 * must never be a hard requirement. When GOOGLE_VISION_API_KEY is configured
 * the document text is read and its confidence contributes to the submission
 * confidence score. When the key is absent the caller records that OCR was
 * unavailable and the score is calculated from the remaining evidence.
 */

export interface OcrResult {
  text: string
  /** 0-100, comparable with the other confidence components. */
  confidence: number
  engine: string
}

export interface OcrPhotoInput {
  id: number
  type: string
  buffer: Buffer
}

export interface OcrBatchResult {
  available: boolean
  processed: number
  skipped: number
}

export function isOcrConfigured(): boolean {
  return Boolean(process.env.GOOGLE_VISION_API_KEY?.trim())
}

function collectConfidences(value: any, found: number[]): void {
  if (!value || typeof value !== 'object') return

  if (typeof value.confidence === 'number' && Number.isFinite(value.confidence)) {
    found.push(value.confidence)
  }

  if (Array.isArray(value)) {
    for (const entry of value) collectConfidences(entry, found)
    return
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') collectConfidences(child, found)
  }
}

/**
 * Read the text of one image with the Google Vision REST API.
 *
 * Returns null when OCR is not configured or the provider request failed. A
 * failed OCR call is not an error the agent should see: the photo is still
 * stored and the submission is simply scored without the OCR component.
 */
export async function extractTextFromImage(
  buffer: Buffer,
  apiKey = process.env.GOOGLE_VISION_API_KEY
): Promise<OcrResult | null> {
  if (!apiKey || apiKey.trim() === '') return null

  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey.trim())}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: buffer.toString('base64') },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
              imageContext: { languageHints: ['en'] },
            },
          ],
        }),
      }
    )

    if (!response.ok) {
      console.error('OCR provider returned an error:', response.status, await response.text().catch(() => ''))
      return null
    }

    const payload = await response.json()
    const first = payload?.responses?.[0]
    const annotation = first?.fullTextAnnotation
    const text: string = annotation?.text || first?.textAnnotations?.[0]?.description || ''

    if (!text.trim()) {
      return { text: '', confidence: 0, engine: 'google-vision' }
    }

    const confidences: number[] = []
    collectConfidences(annotation?.pages, confidences)

    let confidence: number
    let engine = 'google-vision'
    if (confidences.length > 0) {
      const average = confidences.reduce((sum, value) => sum + value, 0) / confidences.length
      confidence = Math.round(Math.min(100, Math.max(0, average * 100)))
    } else {
      // Vision does not always return a per-page confidence. Text was still
      // recognised, so the score reflects readable text without pretending to
      // know the engine's exact certainty.
      confidence = 70
      engine = 'google-vision-estimated'
    }

    return { text, confidence, engine }
  } catch (error) {
    console.error('OCR request failed:', error)
    return null
  }
}

/** The photo types that carry the result figures and are worth reading. */
const OCR_PHOTO_TYPES = ['full_form', 'closeup']

/**
 * Read the submitted form photos and store the text and confidence on each
 * photo row. Runs after the submission transaction has committed, so a slow
 * OCR provider never holds a database transaction open.
 */
export async function ocrSubmissionPhotos(
  submissionId: number,
  photos: OcrPhotoInput[]
): Promise<OcrBatchResult> {
  if (!isOcrConfigured()) {
    return { available: false, processed: 0, skipped: photos.length }
  }

  const candidates = photos
    .filter((photo) => OCR_PHOTO_TYPES.includes(photo.type))
    .slice(0, 2)

  if (candidates.length === 0) {
    return { available: true, processed: 0, skipped: photos.length }
  }

  let processed = 0

  for (const photo of candidates) {
    const result = await extractTextFromImage(photo.buffer)
    if (!result) continue

    try {
      await query(
        `UPDATE submission_photos
            SET ocr_text = $1,
                ocr_confidence = $2,
                ocr_engine = $3,
                ocr_processed_at = NOW()
          WHERE id = $4 AND submission_id = $5`,
        [result.text, result.confidence, result.engine, photo.id, submissionId]
      )
      processed++
    } catch (error) {
      console.error('Could not store OCR result for photo', photo.id, error)
    }
  }

  return {
    available: true,
    processed,
    skipped: photos.length - processed,
  }
}
