#!/usr/bin/env node

/**
 * Seed Official IEBC Geographic Data
 *
 * Seeds:
 * - All 47 counties (official IEBC data)
 * - All 290 constituencies (official IEBC data)
 * - Placeholder wards (3-5 per constituency for structure)
 *
 * Does NOT seed:
 * - Polling stations (user will add as needed)
 * - Users, candidates, agents (user will create their own)
 *
 * Usage:
 *   node scripts/seed-iebc-geography.js
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ukwelitally:dev_password_123@localhost:5432/ukwelitally',
});

// All 47 Official Kenya Counties with IEBC codes
const counties = [
  { code: '001', name: 'Mombasa' },
  { code: '002', name: 'Kwale' },
  { code: '003', name: 'Kilifi' },
  { code: '004', name: 'Tana River' },
  { code: '005', name: 'Lamu' },
  { code: '006', name: 'Taita Taveta' },
  { code: '007', name: 'Garissa' },
  { code: '008', name: 'Wajir' },
  { code: '009', name: 'Mandera' },
  { code: '010', name: 'Marsabit' },
  { code: '011', name: 'Isiolo' },
  { code: '012', name: 'Meru' },
  { code: '013', name: 'Tharaka-Nithi' },
  { code: '014', name: 'Embu' },
  { code: '015', name: 'Kitui' },
  { code: '016', name: 'Machakos' },
  { code: '017', name: 'Makueni' },
  { code: '018', name: 'Nyandarua' },
  { code: '019', name: 'Nyeri' },
  { code: '020', name: 'Kirinyaga' },
  { code: '021', name: "Murang'a" },
  { code: '022', name: 'Kiambu' },
  { code: '023', name: 'Turkana' },
  { code: '024', name: 'West Pokot' },
  { code: '025', name: 'Samburu' },
  { code: '026', name: 'Trans Nzoia' },
  { code: '027', name: 'Uasin Gishu' },
  { code: '028', name: 'Elgeyo/Marakwet' },
  { code: '029', name: 'Nandi' },
  { code: '030', name: 'Baringo' },
  { code: '031', name: 'Laikipia' },
  { code: '032', name: 'Nakuru' },
  { code: '033', name: 'Narok' },
  { code: '034', name: 'Kajiado' },
  { code: '035', name: 'Kericho' },
  { code: '036', name: 'Bomet' },
  { code: '037', name: 'Kakamega' },
  { code: '038', name: 'Vihiga' },
  { code: '039', name: 'Bungoma' },
  { code: '040', name: 'Busia' },
  { code: '041', name: 'Siaya' },
  { code: '042', name: 'Kisumu' },
  { code: '043', name: 'Homa Bay' },
  { code: '044', name: 'Migori' },
  { code: '045', name: 'Kisii' },
  { code: '046', name: 'Nyamira' },
  { code: '047', name: 'Nairobi' },
];

// All 290 Official Constituencies with county mapping
const constituenciesData = `1,1,Changamwe
2,1,Jomvu
3,1,Kisauni
4,1,Nyali
5,1,Likoni
6,1,Mvita
7,2,Msambweni
8,2,Lungalunga
9,2,Matuga
10,2,Kinango
11,3,Kilifi North
12,3,Kilifi South
13,3,Kaloleni
14,3,Rabai
15,3,Ganze
16,3,Malindi
17,3,Magarini
18,4,Garsen
19,4,Galole
20,4,Bura
21,5,Lamu East
22,5,Lamu West
23,6,Taveta
24,6,Wundanyi
25,6,Mwatate
26,6,Voi
27,7,Garissa Township
28,7,Balambala
29,7,Lagdera
30,7,Dadaab
31,7,Fafi
32,7,Ijara
33,8,Wajir North
34,8,Wajir East
35,8,Tarbaj
36,8,Wajir West
37,8,Eldas
38,8,Wajir South
39,9,Mandera West
40,9,Banissa
41,9,Mandera North
42,9,Mandera South
43,9,Mandera East
44,9,Lafey
45,10,Moyale
46,10,North Horr
47,10,Saku
48,10,Laisamis
49,11,Isiolo North
50,11,Isiolo South
51,12,Igembe South
52,12,Igembe Central
53,12,Igembe North
54,12,Tigania West
55,12,Tigania East
56,12,North Imenti
57,12,Buuri
58,12,Central Imenti
59,12,South Imenti
60,13,Maara
61,13,Chuka/Igambang'ombe
62,13,Tharaka
63,14,Manyatta
64,14,Runyenjes
65,14,Mbeere South
66,14,Mbeere North
67,15,Mwingi North
68,15,Mwingi West
69,15,Mwingi Central
70,15,Kitui West
71,15,Kitui Rural
72,15,Kitui Central
73,15,Kitui East
74,15,Kitui South
75,16,Masinga
76,16,Yatta
77,16,Kangundo
78,16,Matungulu
79,16,Kathiani
80,16,Mavoko
81,16,Machakos Town
82,16,Mwala
83,17,Mbooni
84,17,Kilome
85,17,Kaiti
86,17,Makueni
87,17,Kibwezi West
88,17,Kibwezi East
89,18,Kinangop
90,18,Kipipiri
91,18,Ol Kalou
92,18,Ol Jorok
93,18,Ndaragwa
94,19,Tetu
95,19,Kieni
96,19,Mathira
97,19,Othaya
98,19,Mukurweini
99,19,Nyeri Town
100,20,Mwea
101,20,Gichugu
102,20,Ndia
103,20,Kirinyaga Central
104,21,Kangema
105,21,Mathioya
106,21,Kiharu
107,21,Kigumo
108,21,Maragwa
109,21,Kandara
110,21,Gatanga
111,22,Gatundu South
112,22,Gatundu North
113,22,Juja
114,22,Thika Town
115,22,Ruiru
116,22,Githunguri
117,22,Kiambu
118,22,Kiambaa
119,22,Kabete
120,22,Kikuyu
121,22,Limuru
122,22,Lari
123,23,Turkana North
124,23,Turkana West
125,23,Turkana Central
126,23,Loima
127,23,Turkana South
128,23,Turkana East
129,24,Kapenguria
130,24,Sigor
131,24,Kacheliba
132,24,Pokot South
133,25,Samburu West
134,25,Samburu North
135,25,Samburu East
136,26,Kwanza
137,26,Endebess
138,26,Saboti
139,26,Kiminini
140,26,Cherangany
141,27,Soy
142,27,Turbo
143,27,Moiben
144,27,Ainabkoi
145,27,Kapseret
146,27,Kesses
147,28,Marakwet East
148,28,Marakwet West
149,28,Keiyo North
150,28,Keiyo South
151,29,Tinderet
152,29,Aldai
153,29,Nandi Hills
154,29,Chesumei
155,29,Emgwen
156,29,Mosop
157,30,Tiaty
158,30,Baringo North
159,30,Baringo Central
160,30,Baringo South
161,30,Mogotio
162,30,Eldama Ravine
163,31,Laikipia West
164,31,Laikipia East
165,31,Laikipia North
166,32,Molo
167,32,Njoro
168,32,Naivasha
169,32,Gilgil
170,32,Kuresoi South
171,32,Kuresoi North
172,32,Subukia
173,32,Rongai
174,32,Bahati
175,32,Nakuru Town West
176,32,Nakuru Town East
177,33,Kilgoris
178,33,Emurua Dikirr
179,33,Narok North
180,33,Narok East
181,33,Narok South
182,33,Narok West
183,34,Kajiado North
184,34,Kajiado Central
185,34,Kajiado East
186,34,Kajiado West
187,34,Kajiado South
188,35,Kipkelion East
189,35,Kipkelion West
190,35,Ainamoi
191,35,Bureti
192,35,Belgut
193,35,Sigowet/Soin
194,36,Sotik
195,36,Chepalungu
196,36,Bomet East
197,36,Bomet Central
198,36,Konoin
199,37,Lugari
200,37,Likuyani
201,37,Malava
202,37,Lurambi
203,37,Navakholo
204,37,Mumias West
205,37,Mumias East
206,37,Matungu
207,37,Butere
208,37,Khwisero
209,37,Shinyalu
210,37,Ikolomani
211,38,Vihiga
212,38,Sabatia
213,38,Hamisi
214,38,Luanda
215,38,Emuhaya
216,39,Mt.Elgon
217,39,Sirisia
218,39,Kabuchai
219,39,Bumula
220,39,Kanduyi
221,39,Webuye East
222,39,Webuye West
223,39,Kimilili
224,39,Tongaren
225,40,Teso North
226,40,Teso South
227,40,Nambale
228,40,Matayos
229,40,Butula
230,40,Funyula
231,40,Budalangi
232,41,Ugenya
233,41,Ugunja
234,41,Alego Usonga
235,41,Gem
236,41,Bondo
237,41,Rarieda
238,42,Kisumu East
239,42,Kisumu West
240,42,Kisumu Central
241,42,Seme
242,42,Nyando
243,42,Muhoroni
244,42,Nyakach
245,43,Kasipul
246,43,Kabondo Kasipul
247,43,Karachuonyo
248,43,Rangwe
249,43,Homa Bay Town
250,43,Ndhiwa
251,43,Mbita
252,43,Suba
253,44,Rongo
254,44,Awendo
255,44,Suna East
256,44,Suna West
257,44,Uriri
258,44,Nyatike
259,44,Kuria West
260,44,Kuria East
261,45,Bonchari
262,45,South Mugirango
263,45,Bomachoge Borabu
264,45,Bobasi
265,45,Bomachoge Chache
266,45,Nyaribari Masaba
267,45,Nyaribari Chache
268,45,Kitutu Chache North
269,45,Kitutu Chache South
270,46,Kitutu Masaba
271,46,West Mugirango
272,46,North Mugirango
273,46,Borabu
274,47,Westlands
275,47,Dagoretti North
276,47,Dagoretti South
277,47,Langata
278,47,Kibra
279,47,Roysambu
280,47,Kasarani
281,47,Ruaraka
282,47,Embakasi South
283,47,Embakasi North
284,47,Embakasi Central
285,47,Embakasi East
286,47,Embakasi West
287,47,Makadara
288,47,Kamukunji
289,47,Starehe
290,47,Mathare`;

const constituencies = constituenciesData.split('\n').map(line => {
  const [id, county_number, name] = line.split(',');
  return {
    id: parseInt(id),
    county_code: String(county_number).padStart(3, '0'),
    name: name.trim()
  };
});

async function clearData() {
  console.log('🗑️  Clearing existing data (keeping admin users)...');
  await pool.query('DELETE FROM candidate_votes');
  await pool.query('DELETE FROM results');
  await pool.query('DELETE FROM submission_photos');
  await pool.query('DELETE FROM submissions');
  await pool.query('DELETE FROM agents');
  await pool.query('DELETE FROM candidates');
  await pool.query('DELETE FROM users WHERE role != \'admin\'');
  await pool.query('DELETE FROM polling_stations');
  await pool.query('DELETE FROM wards');
  await pool.query('DELETE FROM constituencies');
  await pool.query('DELETE FROM counties');
  console.log('✅ Data cleared (admin users preserved)\n');
}

async function seedCounties() {
  console.log(`📍 Seeding ${counties.length} official IEBC counties...`);

  for (const county of counties) {
    const result = await pool.query(
      'INSERT INTO counties (code, name, registered_voters) VALUES ($1, $2, $3) RETURNING id',
      [county.code, county.name, 0]
    );
    county.db_id = result.rows[0].id;
  }

  console.log(`✅ ${counties.length} counties seeded\n`);
  return counties;
}

async function seedConstituencies(countiesMap) {
  console.log(`🏛️  Seeding ${constituencies.length} official IEBC constituencies...`);

  for (const constituency of constituencies) {
    const countyId = countiesMap[constituency.county_code];
    if (countyId) {
      const result = await pool.query(
        'INSERT INTO constituencies (code, name, county_id, registered_voters) VALUES ($1, $2, $3, $4) RETURNING id',
        [String(constituency.id).padStart(3, '0'), constituency.name, countyId, 0]
      );
      constituency.db_id = result.rows[0].id;
      constituency.county_id = countyId;
    }
  }

  console.log(`✅ ${constituencies.length} constituencies seeded\n`);
  return constituencies;
}

async function generatePlaceholderWards(constituenciesData) {
  console.log('🗺️  Generating placeholder wards (3-5 per constituency)...');

  let wardCount = 0;
  const allWards = [];

  for (const constituency of constituenciesData) {
    if (!constituency.db_id) continue;

    // Generate 3-5 placeholder wards per constituency
    const wardsPerConstituency = Math.floor(Math.random() * 3) + 3; // 3 to 5 wards

    for (let i = 1; i <= wardsPerConstituency; i++) {
      wardCount++;
      const wardName = `${constituency.name} Ward ${i}`;

      // Get county_id for this ward
      const result = await pool.query(
        'INSERT INTO wards (code, name, constituency_id, county_id, registered_voters) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [`W${String(wardCount).padStart(4, '0')}`, wardName, constituency.db_id, constituency.county_id, 0]
      );

      allWards.push({
        id: result.rows[0].id,
        name: wardName,
        constituency_id: constituency.db_id,
        county_id: constituency.county_id
      });
    }

    // Show progress every 50 constituencies
    if (constituency.id % 50 === 0) {
      console.log(`   Generated wards for ${constituency.id}/${constituencies.length} constituencies...`);
    }
  }

  console.log(`✅ ${wardCount} placeholder wards generated\n`);
  return allWards;
}

async function generatePlaceholderPollingStations(wards) {
  console.log('🏫 Generating placeholder polling stations (2-4 per ward)...');

  let stationCount = 0;
  const pollingStationTypes = [
    'Primary School',
    'Secondary School',
    'Community Hall',
    'Chief\'s Office',
    'Social Center',
    'Sports Ground',
    'Public Library',
    'Youth Center'
  ];

  // Kenya GPS coordinates range approximately:
  // Latitude: -4.7 to 5.0 (south to north)
  // Longitude: 33.9 to 41.9 (west to east)

  for (const ward of wards) {
    // Generate 2-4 polling stations per ward
    const stationsPerWard = Math.floor(Math.random() * 3) + 2; // 2 to 4 stations

    for (let i = 1; i <= stationsPerWard; i++) {
      stationCount++;

      // Pick a random polling station type
      const stationType = pollingStationTypes[Math.floor(Math.random() * pollingStationTypes.length)];
      const stationName = `${ward.name.replace(' Ward', '')} ${stationType} ${i}`;

      // Generate realistic Kenya GPS coordinates with some clustering per ward
      // Base coordinates with some ward-specific offset
      const wardSeed = ward.id;
      const baseLatOffset = ((wardSeed % 100) / 100) * 9.7 - 4.7; // Spread across Kenya's latitude
      const baseLngOffset = ((wardSeed % 150) / 150) * 8.0 + 33.9; // Spread across Kenya's longitude

      // Add small random variation for individual stations within the ward
      const latitude = (baseLatOffset + (Math.random() - 0.5) * 0.05).toFixed(6);
      const longitude = (baseLngOffset + (Math.random() - 0.5) * 0.05).toFixed(6);

      // Random registered voters between 300-1200 per polling station
      const registeredVoters = Math.floor(Math.random() * 900) + 300;

      await pool.query(
        `INSERT INTO polling_stations
         (code, name, ward_id, constituency_id, county_id, latitude, longitude, registered_voters, location_radius)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 500)`,
        [
          `PS${String(stationCount).padStart(6, '0')}`,
          stationName,
          ward.id,
          ward.constituency_id,
          ward.county_id,
          latitude,
          longitude,
          registeredVoters
        ]
      );
    }

    // Show progress every 200 wards
    if (wards.indexOf(ward) % 200 === 0 && wards.indexOf(ward) > 0) {
      console.log(`   Generated stations for ${wards.indexOf(ward)}/${wards.length} wards...`);
    }
  }

  console.log(`✅ ${stationCount} placeholder polling stations generated\n`);
}

async function displaySummary() {
  const stats = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM counties) as counties,
      (SELECT COUNT(*) FROM constituencies) as constituencies,
      (SELECT COUNT(*) FROM wards) as wards,
      (SELECT COUNT(*) FROM polling_stations) as polling_stations
  `);

  const s = stats.rows[0];

  console.log('\n📊 SEEDING SUMMARY');
  console.log('='.repeat(60));
  console.log(`
  ✅ Counties:         ${s.counties} (Official IEBC)
  ✅ Constituencies:   ${s.constituencies} (Official IEBC)
  ✅ Wards:            ${s.wards} (Placeholder - 3-5 per constituency)
  ✅ Polling Stations: ${s.polling_stations} (Placeholder - 2-4 per ward)
  `);
  console.log('='.repeat(60));
  console.log('\n💡 Next Steps:');
  console.log('   1. Create admin user: node scripts/seed-admin.js');
  console.log('   2. Register candidates through the UI');
  console.log('   3. Create agents and assign to polling stations');
  console.log('   4. Agents can submit forms with results\n');
}

async function main() {
  const startTime = Date.now();

  try {
    console.log('\n🚀 IEBC GEOGRAPHIC DATA SEEDING');
    console.log('='.repeat(60) + '\n');

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

    // Generate placeholder wards
    const seededWards = await generatePlaceholderWards(seededConstituencies);

    // Generate placeholder polling stations
    await generatePlaceholderPollingStations(seededWards);

    // Display summary
    await displaySummary();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`⏱️  Completed in ${elapsed}s\n`);

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
