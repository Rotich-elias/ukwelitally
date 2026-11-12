/**
 * Role specific training guides.
 *
 * Every account can download a short, end-to-end guide for the work that role
 * does on UkweliTally. The content lives here so the PDF builder and any future
 * in-app guide page render the same material.
 */

export type TrainingRole = 'admin' | 'candidate' | 'agent' | 'observer'

export interface TrainingSection {
  heading: string
  body?: string
  steps?: string[]
  tips?: string[]
}

export interface TrainingGuide {
  role: TrainingRole
  title: string
  audience: string
  summary: string
  estimatedMinutes: number
  sections: TrainingSection[]
  checklist: string[]
}

const SUPPORT = `Support: ${'elgeiy8@gmail.com'} or ${'tetoteknologies@gmail.com'} · ${'0721 237 811'}`

export const TRAINING_GUIDES: Record<TrainingRole, TrainingGuide> = {
  admin: {
    role: 'admin',
    title: 'Administrator training guide',
    audience: 'Platform administrators',
    summary:
      'Everything needed to run UkweliTally: accounts and password resets, volunteer approval, ballot data, reporting windows, result review and conflicts, opinion polls, archives and security.',
    estimatedMinutes: 35,
    sections: [
      {
        heading: '1. Sign in and understand the dashboard',
        body:
          'Administrators manage the platform rather than report from a polling station. The dashboard has tabs for system users, ballot candidates, electoral locations and reset/archive tools.',
        steps: [
          'Open the platform and sign in with your administrator email and password.',
          'Use the tabs to switch between System Users, Ballot Candidates, Locations and Reset & Archive.',
          'The role badge in the top bar confirms you are signed in as an administrator.',
          'Use the notification bell for review requests and system alerts.',
        ],
        tips: [
          'Never share an administrator password. Create a separate account for each person who needs access.',
        ],
      },
      {
        heading: '2. Create and manage system users',
        body:
          'System users are the accounts that sign in: candidates, agents, observers and other administrators. Ballot candidates imported from IEBC are data records, not accounts.',
        steps: [
          'Open System Users and select + Create User.',
          'Enter the full name, email, phone number, national ID, role and a password, or select Generate for a secure one.',
          'The password must have at least 8 characters with an uppercase letter, a lowercase letter and a number. Published example passwords such as Agent123! are refused.',
          'For a candidate, add the party and position and select the electoral area. The account is only created if the area is valid.',
          'Share the credentials privately, for example by phone or in person. Never post them in a group chat.',
          'Use the status controls to suspend, reactivate or delete an account when necessary. You cannot deactivate your own account.',
        ],
        tips: [
          'A user can only report for the area and role they are assigned to. Check the assignment before troubleshooting a permission error.',
        ],
      },
      {
        heading: '3. Reset a forgotten password',
        body:
          'Passwords are stored encrypted, so nobody, including administrators, can look up a user’s existing password. When a user forgets it, you set a new one. Users cannot change their own password, so this is also how a password is changed.',
        steps: [
          'In System Users, select the key icon (Reset Password) on the user’s row. A secure password is filled in for you.',
          'Keep it, or type your own, and select Save Changes.',
          'Copy the sign-in details from the window that appears. The password is shown only once.',
          'Confirm the person’s identity, then share the new password with them privately.',
          'Saving signs the user out on all of their devices; they sign in again with the new password.',
        ],
        tips: [
          'Reset a password straight away if you think it has been seen by someone else.',
        ],
      },
      {
        heading: '4. Approve volunteers',
        body:
          'Volunteers register on the public form and become observers when you approve them. The form does not verify the name, email, phone or ID number, and the volunteer may choose their own password, so anyone could register in someone else’s name.',
        steps: [
          'Open Volunteers from the dashboard and review the pending registrations.',
          'Confirm each volunteer’s identity before approving, for example by calling the phone number they gave.',
          'Approve the volunteer. The app asks you to confirm, as an approved volunteer can sign in and submit results.',
          'If the volunteer did not choose a password, a secure one is generated and shown to you once. Share it privately.',
          'Reject registrations you cannot verify.',
        ],
      },
      {
        heading: '5. Maintain ballot candidates and electoral geography',
        body:
          'Ballot candidates are the names and parties that appear in the tally. The location tree (county, constituency, ward, polling station) is reference data used by every result.',
        steps: [
          'Open Ballot Candidates to add a single candidate or import a CSV. Download the template from the import window.',
          'In the CSV, give the county, constituency and ward by name, for example Nairobi, Westlands, Parklands/Highridge. Capitalisation and punctuation do not matter.',
          'Governors, senators and women representatives need a county, MPs a constituency, and MCAs a ward. Fill in the constituency for MCAs too, because ward names repeat across the country.',
          'If rows fail, the import window lists each row and the reason. Fix the file and import again.',
          'Confirm the candidate number, party, position and electoral area before saving.',
          'Open Locations to add or edit counties, constituencies, wards and polling stations.',
          'Set the polling station coordinates and allowed radius so GPS verification works.',
          'Import wards and stations in bulk only from an official IEBC file.',
        ],
        tips: [
          'Placeholder candidates are used internally for observer submissions. Do not delete them.',
        ],
      },
      {
        heading: '6. Reporting windows and the result chain',
        body:
          'A candidate opens a reporting window for their race. Agents and observers can only submit while that window is open. Results flow through three stages: submission, result figures and the selected station result.',
        steps: [
          'A candidate opens the window from their dashboard when polling closes.',
          'Agents upload Form 34A photos and GPS, then enter the vote figures. A submission stays pending until its figures are entered.',
          'A primary agent’s result is approved and counted automatically only when its figures pass every check: whole, non-negative numbers that add up, and turnout no higher than the station’s official register.',
          'Figures that fail a check are never counted. The submission is flagged for review instead.',
          'Observers submit alternative results; a candidate approves one as the fallback only when no agent result exists.',
          'Close the window when reporting is complete so no late figures are accepted.',
        ],
        tips: [
          'Never edit raw result rows directly in the database. Use review actions so the audit trail stays intact.',
        ],
      },
      {
        heading: '7. Review submissions and confidence scores',
        body:
          'The confidence score explains how complete the evidence is. It is calculated from GPS distance, photo evidence, OCR readability, arithmetic validation, timeliness and anomaly flags.',
        steps: [
          'Open Review Submissions and filter by status or polling station.',
          'Open a submission to see its photos, GPS verification, figures and confidence breakdown.',
          'Approve a correct submission, reject an invalid one, or request a revision with clear notes.',
          'A submission without figures cannot be approved, and a version replaced by a correction cannot be reviewed.',
          'Candidates cannot approve figures that failed validation; they are sent to you. Approve them only after checking the form photo, as a deliberate override.',
          'A rejected or flagged submission stops being the selected result immediately.',
          'If many old submissions show the same score, open Reset & Archive and run Recalculate all once after deployment.',
        ],
        tips: [
          'A provisional score is calculated before vote figures are entered. It is recalculated automatically when the result is saved.',
          'Confidence is evidence, not a substitute for human review. Read the photos and the figures.',
        ],
      },
      {
        heading: '8. Resolve result conflicts',
        body:
          'A conflict appears when an agent result arrives for a station where an observer fallback was already approved. The station has one result for the whole race, shared by every candidate in it. A candidate can resolve a conflict only if they approved the fallback themselves. Conflicts over a fallback approved by another candidate come to you.',
        steps: [
          'Open Review Submissions. Open conflicts appear in the Result conflicts section at the top.',
          'Check who approved the fallback, and compare the agent and observer figures with their form photos.',
          'Select Use agent result or Keep fallback. Only an approved, current agent result can be used.',
          'A resolved conflict is final and cannot be resolved again.',
        ],
      },
      {
        heading: '9. Opinion polls',
        body:
          'Opinion polls are separate from the official tally. A candidate or administrator can ask a public question, add options and share a link. Visitors can also create polls without an account.',
        steps: [
          'Open Opinion Polls from the dashboard navigation.',
          'Enter the question, optional description and at least two options.',
          'Optionally set a closing date, then create the poll and copy the public link.',
          'Share the link on WhatsApp, X or any other channel.',
          'Close a poll when it is no longer collecting votes, or archive it to remove it from the active list.',
        ],
        tips: [
          'One browser can vote once per poll, and each internet connection can cast at most 25 votes in a poll. If many people share one network, the limit can be raised with the POLL_MAX_VOTES_PER_IP setting.',
          'Polls created by visitors without an account are community polls. They get a random link, are hidden from search engines and are labelled as not an election result.',
          'Archived polls keep their votes in the database.',
        ],
      },
      {
        heading: '10. Reset and archive data safely',
        body:
          'A reset removes test or dry-run data from the live tables, but first writes exactly what it removes into data_archives as JSON. Users, candidates, agents, observers and polling stations are never deleted.',
        steps: [
          'Open Reset & Archive and review the row counts for election data and opinion polls.',
          'Type the exact confirmation phrase shown on the card.',
          'Add a short reason so the archive explains why the reset was run.',
          'Run the reset. The archive id is shown and the public tally updates immediately.',
          'Download or review the archive history before running another reset.',
        ],
        tips: [
          'A reset cannot be undone from the dashboard. The archive is the recovery record, so keep database backups as well.',
        ],
      },
      {
        heading: '11. Security, audit and day-to-day checks',
        steps: [
          'Review the notification bell and audit history for unusual actions.',
          'Suspend an account, or reset its password, immediately if credentials may have leaked.',
          'Make sure no account uses a default or published password such as Admin123 or Agent123!.',
          'Confirm that production uses a durable file storage backend so evidence is not lost.',
          'Check /api/health after a deployment.',
          'Keep the database migration status at the latest version: run npm run db:migrate after each deployment that adds a migration.',
        ],
        tips: [
          'Never paste passwords, tokens or database URLs into chats, screenshots or tickets.',
          'Signing out ends the session on all of a user’s devices.',
        ],
      },
    ],
    checklist: [
      'My administrator password is unique and stored in a password manager.',
      'The ballot candidate list and polling station coordinates are complete.',
      'I know how to reset a forgotten password and share it privately.',
      'I confirm a volunteer’s identity before approving them.',
      'I know how to open Review Submissions, read a confidence breakdown and resolve a result conflict.',
      'I have tested an opinion poll and copied its public link.',
      'I understand that a reset archives before it deletes.',
      'I know where the archive history is and how to contact support.',
    ],
  },

  candidate: {
    role: 'candidate',
    title: 'Candidate training guide',
    audience: 'Candidate accounts',
    summary:
      'Set up your team, control the reporting window, review your agents and observers, and use results, reports and opinion polls.',
    estimatedMinutes: 25,
    sections: [
      {
        heading: '1. Sign in and complete your profile',
        steps: [
          'Sign in with the candidate email and password given to you by the administrator.',
          'Check that your name, party, position and electoral area are correct.',
          'If the profile is wrong, contact the administrator rather than creating another account.',
          'Use the notification bell to see submissions waiting for review.',
        ],
      },
      {
        heading: '2. Understand your team',
        body:
          'Agents report the official result for your candidate at their assigned polling station. Observers report an independent alternative result for the station.',
        steps: [
          'Assign each agent to one polling station and mark one agent as primary where required.',
          'Assign observers to the stations you want independently covered.',
          'Keep contact details up to date so you can reach the team on polling day.',
        ],
        tips: [
          'Only agents and observers you assign can submit for your team.',
          'You see your own team’s submissions and the shared observer submissions for your race. Other teams’ submissions and contact details stay private to them.',
        ],
      },
      {
        heading: '3. Import agents from a CSV file',
        steps: [
          'Open Manage Agents, select Import from CSV and download the template.',
          'Fill in one agent per row: name, email, phone and ID number.',
          'Give the polling station by name: county, constituency, ward, polling station and stream, spelled as in the official IEBC list. Leave the stream empty if the station has only one. Alternatively, fill in the station’s IEBC code and stream.',
          'Leave the candidate column empty: agents are added to your own team.',
          'Leave the password column empty to have a secure password generated for each new agent. A password you enter must have at least 8 characters with an uppercase letter, a lowercase letter and a number.',
          'After the import, download the sign-in details straight away. Generated passwords are shown only once.',
          'Share each agent’s password with that agent privately, never in a group chat.',
        ],
        tips: [
          'If rows fail, the import window lists each row and the reason, such as a misspelled ward or a missing stream. Fix the file and import again.',
          'If an agent forgets their password, ask an administrator to reset it.',
        ],
      },
      {
        heading: '4. Open and close the reporting window',
        steps: [
          'Open your dashboard and select the reporting window control.',
          'Open the window when polling has closed and counting begins.',
          'Tell your team that submissions are now accepted.',
          'Monitor incoming submissions in the review queue.',
          'Close the window when your team has finished reporting or when the deadline passes.',
        ],
        tips: [
          'A submission cannot be made while the window is closed. If an agent reports a closed window, check the window state before troubleshooting their account.',
        ],
      },
      {
        heading: '5. Review agent submissions',
        body:
          'You review your own team’s submissions. A primary agent’s result is approved automatically only when its figures pass every check. The rest wait for you in the review queue.',
        steps: [
          'Open the review queue and select a submission.',
          'Compare the vote figures with the uploaded Form 34A photos.',
          'Check the GPS verification and confidence breakdown.',
          'Approve the submission when it is correct, or reject it with a clear reason.',
          'If the figures are wrong but fixable, request a revision so the agent can correct the submission.',
        ],
        tips: [
          'A rejected submission is removed from the selected result immediately. Do not reject a submission before checking whether it is the only result for the station.',
          'You can only approve a submission once its figures are entered. Figures that failed validation, for example turnout above the station’s register, can only be approved by an administrator. Request a revision instead, or ask an administrator.',
        ],
      },
      {
        heading: '6. Approve an observer fallback and resolve conflicts',
        body:
          'A fallback is an observer submission used as the station result when no agent reported. It is never approved automatically. A station has one result for the whole race, shared by every candidate in it.',
        steps: [
          'Open the observer submission that is waiting for review.',
          'Confirm the observer is assigned to that station and the figures match the form photo.',
          'Approve it only when there is no agent primary submission for the same station and race.',
          'Add a reason so the decision is recorded in the audit trail.',
          'If an agent result arrives after a fallback was approved, a conflict appears at the top of the review page. If you approved that fallback, choose Use agent result or Keep fallback. A resolved conflict is final.',
          'If another candidate approved the fallback, the conflict shows who did. Only an administrator can change that result.',
        ],
      },
      {
        heading: '7. Use results and reports',
        steps: [
          'Open Results to see the live tally for your race and area.',
          'Check the reporting percentage and turnout before drawing conclusions.',
          'Generate a PDF report from the results page when you need a shareable record.',
          'Remember that only selected, verified results are counted.',
        ],
      },
      {
        heading: '8. Create and share an opinion poll',
        steps: [
          'Open Opinion Polls from the dashboard navigation.',
          'Write a clear question and two or more options.',
          'Set an optional closing date and create the poll.',
          'Copy the public link and share it with your audience.',
          'Close the poll when you no longer want votes, or archive it to remove it from the active list.',
        ],
        tips: [
          'An opinion poll is not the official tally. Label it clearly when you share it.',
        ],
      },
      {
        heading: '9. Account security',
        steps: [
          'Keep your password private and sign out on shared devices. Signing out ends your session on all of your devices.',
          'Do not forward screenshots that contain tokens or personal data.',
          'Contact the administrator immediately if you suspect your account was accessed by someone else. They can reset your password.',
          'If you forget your password, ask an administrator to reset it. Nobody can look up your old password.',
        ],
      },
    ],
    checklist: [
      'My profile details are correct.',
      'My agents and observers are assigned to the right stations.',
      'I can import agents from a CSV file and share their passwords privately.',
      'I know how to open and close the reporting window.',
      'I can review a submission and reject it with a reason.',
      'I understand when an observer fallback can be approved and who resolves a conflict.',
      'I know how to create and share an opinion poll.',
    ],
  },

  agent: {
    role: 'agent',
    title: 'Agent training guide',
    audience: 'Polling station agents',
    summary:
      'A step-by-step guide to signing in, capturing Form 34A, submitting accurate figures and correcting a submission safely.',
    estimatedMinutes: 20,
    sections: [
      {
        heading: '1. Before polling day',
        steps: [
          'Confirm with your candidate that you are assigned to the correct polling station.',
          'Test that your phone can take clear photos and that you have enough battery and data.',
          'Sign in once before polling day and check that your dashboard shows the right station.',
          'Save the support number so you can reach someone quickly.',
        ],
        tips: [
          'Use a phone with a working camera and location service. Clear, readable photos matter more than fast submission.',
        ],
      },
      {
        heading: '2. Sign in and check your reporting window',
        steps: [
          'Sign in with the email and password provided by your candidate. Your password is personal: nobody else has the same one.',
          'Read the reporting window banner at the top of the dashboard.',
          'If the window is closed, wait for your candidate to open it. Do not create a second account.',
          'Check that your account is active. A suspended account cannot submit.',
        ],
        tips: [
          'A closed window is not an error. The candidate controls when submissions are accepted.',
          'If you forget your password, ask your candidate or an administrator to reset it. Nobody can look up your old password.',
        ],
      },
      {
        heading: '3. Capture the evidence',
        steps: [
          'Take a full, flat photo of the signed Form 34A. Include the whole form and all four corners.',
          'Take a second close-up photo of the vote figures if the first is not perfectly readable.',
          'Make sure the station name, code, date and signatures are visible.',
          'Keep the original form safe. The photos are the evidence attached to your submission.',
          'Also add a close-up of the stamp or serial number when available.',
        ],
        tips: [
          'Avoid shadows, glare and blur. A rejected photo cannot verify the result.',
        ],
      },
      {
        heading: '4. Submit the result step by step',
        steps: [
          'Open the submission form and confirm the polling station shown is yours.',
          'Registered voters is filled in from the official station register and cannot be changed.',
          'Enter the total votes cast, valid votes and rejected votes exactly as on the form.',
          'Enter every candidate’s votes. Check the figures twice before continuing.',
          'Allow the browser to read your GPS location while you are at the station.',
          'Upload the Form 34A photos.',
          'Submit. The server verifies the window, your assignment and the evidence before saving.',
        ],
        tips: [
          'Do not type figures from memory. Read them directly from the form, candidate by candidate.',
          'Figures must be whole numbers and cannot be negative. Valid plus rejected votes must equal the total cast, the candidates’ votes must add up to the valid votes, and the total cannot be higher than the registered voters.',
        ],
      },
      {
        heading: '5. Understand the confirmation and confidence score',
        body:
          'After submission you receive a submission reference and a confidence score. The score reflects the evidence: GPS distance, photo quality, OCR readability, arithmetic, timeliness and anomaly checks.',
        steps: [
          'Read the confirmation message and note the submission status.',
          'Check that the photo count is what you uploaded.',
          'Your submission shows as pending until the vote figures are entered and checked.',
          'If you are the primary agent and every figure passes the checks, the result is approved and counted automatically. Otherwise your candidate reviews it.',
          'Figures that fail a check are never counted. The submission is flagged so it can be corrected.',
          'A provisional score may update after the result figures are validated.',
          'If the submission is flagged, read the reason and wait for your candidate’s review.',
        ],
        tips: [
          'A low score usually means missing or unclear photos, missing GPS, late submission or figures that do not add up. It is not a rejection by itself.',
        ],
      },
      {
        heading: '6. Correct a wrong submission',
        steps: [
          'You can only correct a submission that is flagged or rejected.',
          'Open the submission and choose the correction option.',
          'Write a clear reason for the correction. This is required.',
          'Capture new photos and enter the corrected figures.',
          'Submit the correction. The original version and its evidence stay in the database.',
        ],
        tips: [
          'Never create a second account or ask someone else to submit for you. Corrections are linked to your original submission.',
        ],
      },
      {
        heading: '7. Troubleshooting',
        steps: [
          '“Reporting window closed”: wait for your candidate to open it.',
          '“Not assigned to this station”: check your assignment with your candidate.',
          '“Photos could not be stored”: check your connection and try smaller photos.',
          'Location not verified: enable GPS and stand at the station; do not spoof the location.',
          'Duplicate submission: open the existing submission instead of submitting again.',
          '“Invalid result data”: a figure is missing, negative or not a whole number. Check every box.',
          'Forgotten password: ask your candidate or an administrator to reset it.',
          'Signed out on your phone after signing out on another device: signing out ends your session everywhere. Sign in again.',
        ],
        tips: [
          'If the problem continues, send the exact error message and your station code to support.',
        ],
      },
      {
        heading: '8. Do and do not',
        steps: [
          'Do submit as soon as counting is complete.',
          'Do keep the form photos and the original form safe.',
          'Do double-check candidate votes against the form.',
          'Do not share your password or let another person submit under your account.',
          'Do not alter or stage photos.',
          'Do not submit a result you have not seen on the signed form.',
        ],
      },
    ],
    checklist: [
      'I am assigned to the correct polling station.',
      'I know how to take a readable full-form photo.',
      'I can enter all vote figures without mistakes, and I know they must add up.',
      'I know that GPS and clear photos raise the confidence score.',
      'I know who to ask if I forget my password.',
      'I know how to correct a flagged submission with a reason.',
      'I have the support contact saved on my phone.',
    ],
  },

  observer: {
    role: 'observer',
    title: 'Observer training guide',
    audience: 'Independent observers',
    summary:
      'How to register, sign in with your own password, observe the count, submit an alternative result and understand the fallback review.',
    estimatedMinutes: 18,
    sections: [
      {
        heading: '1. Register and get approved',
        steps: [
          'Open the volunteer registration page and enter your personal and location details.',
          'Choose your own password and confirm it. Use at least 8 characters with an uppercase letter, a lowercase letter and a number.',
          'Select the polling station you are observing.',
          'Submit the registration and wait for an administrator to approve it.',
          'Before approving, the administrator confirms your identity, for example by calling the phone number you gave. Answer that call.',
          'After approval you can sign in immediately with the password you chose.',
        ],
        tips: [
          'Keep your registration email and phone number current. Approval is tied to the station you selected.',
          'Register only in your own name, with your own email, phone and ID number.',
        ],
      },
      {
        heading: '2. Sign in and check your assignment',
        steps: [
          'Sign in with the email and password you chose at registration.',
          'Check that your dashboard shows the correct polling station and assignment type.',
          'Read the reporting window banner before trying to submit.',
          'If your assignment is wrong, contact an administrator before polling day.',
        ],
        tips: [
          'You can view detailed results only for the polling station you are assigned to. Other submitters’ contact details are not shown to observers.',
        ],
      },
      {
        heading: '3. Observe the count',
        steps: [
          'Arrive early and follow the polling station rules and the instructions of officials.',
          'Observe the counting of ballots and the completion of Form 34A.',
          'Record the figures independently. Do not copy from another person’s result.',
          'Note any irregularities and report them through the proper channel.',
          'Stay neutral. Your role is to observe and record, not to campaign.',
        ],
      },
      {
        heading: '4. Capture the form',
        steps: [
          'Take a clear full photo of the signed Form 34A.',
          'Take a close-up of the vote figures if needed.',
          'Check that the station name, code, date and signatures are readable.',
          'Keep the photos as your own evidence of what you observed.',
        ],
        tips: [
          'Photos taken inside a polling station must follow the rules given by officials. Do not photograph people or ballot papers in a way that is not allowed.',
        ],
      },
      {
        heading: '5. Submit an alternative result',
        steps: [
          'Open the observer submission form when the reporting window is open.',
          'Confirm the station shown is the station you are assigned to.',
          'Registered voters is filled in from the official station register and cannot be changed.',
          'Enter the total votes cast, valid votes and rejected votes from the form. Figures must be whole numbers and cannot be negative, and they must add up.',
          'Enter the presidential candidate votes exactly as recorded.',
          'Allow GPS access while you are at the station and upload the form photos.',
          'Submit. An observer submission is stored as an alternative result and does not replace an agent result on its own.',
        ],
        tips: [
          'Observers report the race enabled for their assignment. If no race is shown, no candidate team is reporting that station yet.',
        ],
      },
      {
        heading: '6. The fallback review',
        body:
          'If no agent submitted a result for a station, the candidate can approve your observer submission as the fallback result for that station.',
        steps: [
          'After submission, your result shows a pending review status.',
          'The candidate compares your figures with the form photo and the assignment.',
          'If approved, your submission becomes the station’s selected result.',
          'If rejected, the reason is recorded and the submission is kept for audit.',
          'If an agent result arrives later, the candidate who approved your fallback, or an administrator, decides which result stands. Both submissions are kept.',
          'You do not approve your own submission.',
        ],
        tips: [
          'An approved fallback is still labelled as an observer result. It is never presented as an agent result.',
        ],
      },
      {
        heading: '7. Understand the confidence score',
        body:
          'The confidence score is a summary of the evidence attached to your submission: GPS distance, readable form photos, OCR readability when available, whether the figures add up, how quickly you submitted and whether any anomaly was detected.',
        steps: [
          'Check the score and the breakdown in your submission list.',
          'A low score usually points to missing GPS, a missing or blurry form photo, late submission or figures that do not add up.',
          'Read the flagged reason if the submission is flagged.',
          'Wait for the review decision before assuming the result was accepted or rejected.',
        ],
      },
      {
        heading: '8. Troubleshooting',
        steps: [
          'Cannot sign in: use the password you chose at registration. Ask an administrator to reset it if you have forgotten it; nobody can look up your old password.',
          'Signed out on your phone after signing out on another device: signing out ends your session everywhere. Sign in again.',
          '“No active observer assignment”: your registration is not approved or your station is not set.',
          '“Reporting window closed”: wait for the candidate to open it.',
          'Location not verified: enable GPS and stay at the station; do not fake the location.',
          'Duplicate submission: open your existing submission instead of creating another.',
        ],
      },
      {
        heading: '9. Independence and safety',
        steps: [
          'Do not accept instructions that change what you personally observed.',
          'Do not share your account or password.',
          'Report intimidation or irregularities immediately through the official channel.',
          'Keep your own notes and photos safe until the process is complete.',
        ],
      },
    ],
    checklist: [
      'I registered with my own password and my station is correct.',
      'I can sign in and see my assignment.',
      'I know what to photograph and what to record.',
      'I understand that my result is an alternative until approved.',
      'I know what raises or lowers the confidence score.',
      'I have the support contact saved.',
    ],
  },
}

export function getTrainingGuide(role: string): TrainingGuide {
  if (role === 'admin' || role === 'candidate' || role === 'agent' || role === 'observer') {
    return TRAINING_GUIDES[role]
  }
  return TRAINING_GUIDES.agent
}

export const TRAINING_SUPPORT = SUPPORT
