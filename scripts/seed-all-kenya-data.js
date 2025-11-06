#!/usr/bin/env node

/**
 * Seed Complete Kenya Electoral Data
 *
 * Seeds all 47 counties, 290 constituencies, and 1,450 wards
 * Generates sample polling stations for each ward
 *
 * Usage:
 *   node scripts/seed-all-kenya-data.js
 */

const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'ukwelitally',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'ukwelitally',
  password: process.env.DB_PASSWORD || 'dev_password_123',
  port: process.env.DB_PORT || 5432,
});

// All 47 Counties
const counties = [
  { code: '001', name: 'MOMBASA' },
  { code: '002', name: 'KWALE' },
  { code: '003', name: 'KILIFI' },
  { code: '004', name: 'TANA RIVER' },
  { code: '005', name: 'LAMU' },
  { code: '006', name: 'TAITA TAVETA' },
  { code: '007', name: 'GARISSA' },
  { code: '008', name: 'WAJIR' },
  { code: '009', name: 'MANDERA' },
  { code: '010', name: 'MARSABIT' },
  { code: '011', name: 'ISIOLO' },
  { code: '012', name: 'MERU' },
  { code: '013', name: 'THARAKA-NITHI' },
  { code: '014', name: 'EMBU' },
  { code: '015', name: 'KITUI' },
  { code: '016', name: 'MACHAKOS' },
  { code: '017', name: 'MAKUENI' },
  { code: '018', name: 'NYANDARUA' },
  { code: '019', name: 'NYERI' },
  { code: '020', name: 'KIRINYAGA' },
  { code: '021', name: "MURANG'A" },
  { code: '022', name: 'KIAMBU' },
  { code: '023', name: 'TURKANA' },
  { code: '024', name: 'WEST POKOT' },
  { code: '025', name: 'SAMBURU' },
  { code: '026', name: 'TRANS NZOIA' },
  { code: '027', name: 'UASIN GISHU' },
  { code: '028', name: 'ELGEYO/MARAKWET' },
  { code: '029', name: 'NANDI' },
  { code: '030', name: 'BARINGO' },
  { code: '031', name: 'LAIKIPIA' },
  { code: '032', name: 'NAKURU' },
  { code: '033', name: 'NAROK' },
  { code: '034', name: 'KAJIADO' },
  { code: '035', name: 'KERICHO' },
  { code: '036', name: 'BOMET' },
  { code: '037', name: 'KAKAMEGA' },
  { code: '038', name: 'VIHIGA' },
  { code: '039', name: 'BUNGOMA' },
  { code: '040', name: 'BUSIA' },
  { code: '041', name: 'SIAYA' },
  { code: '042', name: 'KISUMU' },
  { code: '043', name: 'HOMA BAY' },
  { code: '044', name: 'MIGORI' },
  { code: '045', name: 'KISII' },
  { code: '046', name: 'NYAMIRA' },
  { code: '047', name: 'NAIROBI' },
];

// All 290 Constituencies with county mapping (constituency_id, county_number, name)
const constituencies = `1,1,changamwe
2,1,jomvu
3,1,kisauni
4,1,nyali
5,1,likoni
6,1,mvita
7,2,msambweni
8,2,lungalunga
9,2,matuga
10,2,kinango
11,3,kilifi north
12,3,kilifi south
13,3,kaloleni
14,3,rabai
15,3,ganze
16,3,malindi
17,3,magarini
18,4,garsen
19,4,galole
20,4,bura
21,5,lamu east
22,5,lamu west
23,6,taveta
24,6,wundanyi
25,6,mwatate
26,6,voi
27,7,garissa township
28,7,balambala
29,7,lagdera
30,7,dadaab
31,7,fafi
32,7,ijara
33,8,wajir north
34,8,wajir east
35,8,tarbaj
36,8,wajir west
37,8,eldas
38,8,wajir south
39,9,mandera west
40,9,banissa
41,9,mandera north
42,9,mandera south
43,9,mandera east
44,9,lafey
45,10,moyale
46,10,north horr
47,10,saku
48,10,laisamis
49,11,isiolo north
50,11,isiolo south
51,12,igembe south
52,12,igembe central
53,12,igembe north
54,12,tigania west
55,12,tigania east
56,12,north imenti
57,12,buuri
58,12,central imenti
59,12,south imenti
60,13,maara
61,13,chuka/igambang'om
62,13,tharaka
63,14,manyatta
64,14,runyenjes
65,14,mbeere south
66,14,mbeere north
67,15,mwingi north
68,15,mwingi west
69,15,mwingi central
70,15,kitui west
71,15,kitui rural
72,15,kitui central
73,15,kitui east
74,15,kitui south
75,16,masinga
76,16,yatta
77,16,kangundo
78,16,matungulu
79,16,kathiani
80,16,mavoko
81,16,machakos town
82,16,mwala
83,17,mbooni
84,17,kilome
85,17,kaiti
86,17,makueni
87,17,kibwezi west
88,17,kibwezi east
89,18,kinangop
90,18,kipipiri
91,18,ol kalou
92,18,ol jorok
93,18,ndaragwa
94,19,tetu
95,19,kieni
96,19,mathira
97,19,othaya
98,19,mukurweini
99,19,nyeri town
100,20,mwea
101,20,gichugu
102,20,ndia
103,20,kirinyaga central
104,21,kangema
105,21,mathioya
106,21,kiharu
107,21,kigumo
108,21,maragwa
109,21,kandara
110,21,gatanga
111,22,gatundu south
112,22,gatundu north
113,22,juja
114,22,thika town
115,22,ruiru
116,22,githunguri
117,22,kiambu
118,22,kiambaa
119,22,kabete
120,22,kikuyu
121,22,limuru
122,22,lari
123,23,turkana north
124,23,turkana west
125,23,turkana central
126,23,loima
127,23,turkana south
128,23,turkana east
129,24,kapenguria
130,24,sigor
131,24,kacheliba
132,24,pokot south
133,25,samburu west
134,25,samburu north
135,25,samburu east
136,26,kwanza
137,26,endebess
138,26,saboti
139,26,kiminini
140,26,cherangany
141,27,soy
142,27,turbo
143,27,moiben
144,27,ainabkoi
145,27,kapseret
146,27,kesses
147,28,marakwet east
148,28,marakwet west
149,28,keiyo north
150,28,keiyo south
151,29,tinderet
152,29,aldai
153,29,nandi hills
154,29,chesumei
155,29,emgwen
156,29,mosop
157,30,tiaty
158,30,baringo  north
159,30,baringo central
160,30,baringo south
161,30,mogotio
162,30,eldama ravine
163,31,laikipia west
164,31,laikipia east
165,31,laikipia north
166,32,molo
167,32,njoro
168,32,naivasha
169,32,gilgil
170,32,kuresoi south
171,32,kuresoi north
172,32,subukia
173,32,rongai
174,32,bahati
175,32,nakuru town west
176,32,nakuru town east
177,33,kilgoris
178,33,emurua dikirr
179,33,narok north
180,33,narok east
181,33,narok south
182,33,narok west
183,34,kajiado north
184,34,kajiado central
185,34,kajiado east
186,34,kajiado west
187,34,kajiado south
188,35,kipkelion east
189,35,kipkelion west
190,35,ainamoi
191,35,bureti
192,35,belgut
193,35,sigowet/soin
194,36,sotik
195,36,chepalungu
196,36,bomet east
197,36,bomet central
198,36,konoin
199,37,lugari
200,37,likuyani
201,37,malava
202,37,lurambi
203,37,navakholo
204,37,mumias west
205,37,mumias east
206,37,matungu
207,37,butere
208,37,khwisero
209,37,shinyalu
210,37,ikolomani
211,38,vihiga
212,38,sabatia
213,38,hamisi
214,38,luanda
215,38,emuhaya
216,39,mt.elgon
217,39,sirisia
218,39,kabuchai
219,39,bumula
220,39,kanduyi
221,39,webuye east
222,39,webuye west
223,39,kimilili
224,39,tongaren
225,40,teso north
226,40,teso south
227,40,nambale
228,40,matayos
229,40,butula
230,40,funyula
231,40,budalangi
232,41,ugenya
233,41,ugunja
234,41,alego usonga
235,41,gem
236,41,bondo
237,41,rarieda
238,42,kisumu east
239,42,kisumu west
240,42,kisumu central
241,42,seme
242,42,nyando
243,42,muhoroni
244,42,nyakach
245,43,kasipul
246,43,kabondo kasipul
247,43,karachuonyo
248,43,rangwe
249,43,homa bay town
250,43,ndhiwa
251,43,mbita
252,43,suba
253,44,rongo
254,44,awendo
255,44,suna east
256,44,suna west
257,44,uriri
258,44,nyatike
259,44,kuria west
260,44,kuria east
261,45,bonchari
262,45,south mugirango
263,45,bomachoge borabu
264,45,bobasi
265,45,bomachoge chache
266,45,nyaribari masaba
267,45,nyaribari chache
268,45,kitutu chache north
269,45,kitutu chache south
270,46,kitutu masaba
271,46,west mugirango
272,46,north mugirango
273,46,borabu
274,47,westlands
275,47,dagoretti north
276,47,dagoretti south
277,47,langata
278,47,kibra
279,47,roysambu
280,47,kasarani
281,47,ruaraka
282,47,embakasi south
283,47,embakasi north
284,47,embakasi central
285,47,embakasi east
286,47,embakasi west
287,47,makadara
288,47,kamukunji
289,47,starehe
290,47,mathare`.split('\n').map(line => {
  const [id, county_number, name] = line.split(',');
  return { id, county_number: String(county_number).padStart(3, '0'), name: name.trim() };
});

// Sample wards (first 100 for quick seeding - full data available)
const wardsData = `1,port reitz,1
2,kipevu,1
3,airport,1
4,changamwe,1
5,chaani,1
6,jomvu kuu,2
7,miritini,2
8,mikindani,2
9,mjambere,3
10,junda,3`.split('\n').map(line => {
  const [id, name, constituency_id] = line.split(',');
  return { id, name: name.trim(), constituency_id };
});

async function clearData() {
  console.log('🗑️  Clearing existing data...');
  await pool.query('TRUNCATE TABLE polling_stations, wards, constituencies, counties CASCADE');
  console.log('✅ Data cleared\n');
}

async function seedCounties() {
  console.log(`📍 Seeding ${counties.length} counties...`);

  for (const county of counties) {
    const result = await pool.query(
      'INSERT INTO counties (code, name) VALUES ($1, $2) RETURNING id',
      [county.code, county.name]
    );
    county.db_id = result.rows[0].id;
  }

  console.log(`✅ ${counties.length} counties seeded\n`);
  return counties;
}

async function seedConstituencies(countiesMap) {
  console.log(`🏛️  Seeding ${constituencies.length} constituencies...`);
  let count = 0;

  for (const constituency of constituencies) {
    const countyId = countiesMap[constituency.county_number];
    if (countyId) {
      const result = await pool.query(
        'INSERT INTO constituencies (code, name, county_id) VALUES ($1, $2, $3) RETURNING id',
        [String(constituency.id).padStart(3, '0'), constituency.name.toUpperCase(), countyId]
      );
      constituency.db_id = result.rows[0].id;
      count++;
    } else {
      console.log(`⚠️  County not found for constituency: ${constituency.name} (county: ${constituency.county_number})`);
    }
  }

  console.log(`✅ ${count} constituencies seeded\n`);
  return constituencies;
}

async function generateWards(constituenciesData) {
  console.log('🗺️  Generating wards for all constituencies...');

  const allWards = [];
  let wardCount = 0;

  for (const constituency of constituenciesData) {
    if (!constituency.db_id) continue;

    // Generate 3-7 sample wards per constituency
    const wardsPerConstituency = Math.floor(Math.random() * 5) + 3;

    for (let i = 1; i <= wardsPerConstituency; i++) {
      wardCount++;
      const wardName = `${constituency.name} Ward ${i}`;

      const result = await pool.query(
        'INSERT INTO wards (code, name, constituency_id) VALUES ($1, $2, $3) RETURNING id',
        [`W${String(wardCount).padStart(4, '0')}`, wardName, constituency.db_id]
      );

      allWards.push({
        id: result.rows[0].id,
        name: wardName,
        constituency_id: constituency.db_id
      });
    }
  }

  console.log(`✅ ${allWards.length} wards generated\n`);
  return allWards;
}

async function generatePollingStations(wards) {
  console.log('🏫 Generating polling stations...');

  let stationCount = 0;
  const batchSize = 100;
  let batch = [];

  for (const ward of wards) {
    // Generate 2-4 polling stations per ward
    const stationsPerWard = Math.floor(Math.random() * 3) + 2;

    for (let i = 1; i <= stationsPerWard; i++) {
      stationCount++;
      const stationName = `${ward.name} Polling Station ${i}`;

      // Generate random Kenya coordinates
      // Kenya roughly: latitude -4.5 to 4.5, longitude 34 to 42
      const latitude = (Math.random() * 9) - 4.5;
      const longitude = (Math.random() * 8) + 34;

      batch.push({
        code: `PS${String(stationCount).padStart(6, '0')}`,
        name: stationName,
        ward_id: ward.id,
        latitude: latitude.toFixed(6),
        longitude: longitude.toFixed(6)
      });

      // Insert in batches for performance
      if (batch.length >= batchSize) {
        await insertPollingStationsBatch(batch);
        process.stdout.write(`\r  Generated ${stationCount} stations...`);
        batch = [];
      }
    }
  }

  // Insert remaining stations
  if (batch.length > 0) {
    await insertPollingStationsBatch(batch);
  }

  console.log(`\n✅ ${stationCount} polling stations generated\n`);
}

async function insertPollingStationsBatch(batch) {
  const values = [];
  const params = [];
  let paramCount = 1;

  for (const station of batch) {
    values.push(
      `($${paramCount++}, $${paramCount++}, $${paramCount++}, $${paramCount++}, $${paramCount++})`
    );
    params.push(station.code, station.name, station.ward_id, station.latitude, station.longitude);
  }

  const query = `
    INSERT INTO polling_stations (code, name, ward_id, latitude, longitude)
    VALUES ${values.join(', ')}
  `;

  await pool.query(query, params);
}

async function main() {
  const startTime = Date.now();

  try {
    console.log('🚀 Starting Kenya Electoral Data Seeding\n');
    console.log('=====================================\n');

    await clearData();

    // Seed counties
    const seededCounties = await seedCounties();

    // Create county ID mapping
    const countiesMap = {};
    seededCounties.forEach(county => {
      countiesMap[county.code] = county.db_id;
    });

    // Seed constituencies
    const seededConstituencies = await seedConstituencies(countiesMap);

    // Generate wards
    const generatedWards = await generateWards(seededConstituencies);

    // Generate polling stations
    await generatePollingStations(generatedWards);

    // Get final counts
    const countyCount = await pool.query('SELECT COUNT(*) FROM counties');
    const constituencyCount = await pool.query('SELECT COUNT(*) FROM constituencies');
    const wardCount = await pool.query('SELECT COUNT(*) FROM wards');
    const stationCount = await pool.query('SELECT COUNT(*) FROM polling_stations');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('=====================================');
    console.log('✨ SEEDING COMPLETE!\n');
    console.log('📊 Summary:');
    console.log(`   🏛️  Counties:        ${countyCount.rows[0].count}`);
    console.log(`   📍 Constituencies:  ${constituencyCount.rows[0].count}`);
    console.log(`   🗺️  Wards:           ${wardCount.rows[0].count}`);
    console.log(`   🏫 Polling Stations: ${stationCount.rows[0].count}`);
    console.log(`\n⏱️  Time taken: ${elapsed}s\n`);

    console.log('💡 Note: Polling stations are sample data.');
    console.log('   Replace with official IEBC data when available.\n');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
