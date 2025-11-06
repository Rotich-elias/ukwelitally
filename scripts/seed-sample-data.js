#!/usr/bin/env node

/**
 * Seed Sample Location Data
 *
 * This script adds sample counties, constituencies, wards, and polling stations
 * for testing purposes. Replace with real data when available.
 *
 * Usage:
 *   node scripts/seed-sample-data.js
 */

const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'ukwelitally',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'ukwelitally',
  password: process.env.DB_PASSWORD || 'dev_password_123',
  port: process.env.DB_PORT || 5432,
});

// Sample data representing a few real Kenya locations
const sampleData = {
  counties: [
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
    { code: '013', name: 'Tharaka Nithi' },
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
    { code: '028', name: 'Elgeyo Marakwet' },
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
  ],

  constituencies: [
    // Nairobi County
    { code: '001', name: 'Westlands', county_code: '047' },
    { code: '002', name: 'Dagoretti North', county_code: '047' },
    { code: '003', name: 'Dagoretti South', county_code: '047' },
    { code: '004', name: 'Langata', county_code: '047' },
    { code: '005', name: 'Kibra', county_code: '047' },
    { code: '006', name: 'Roysambu', county_code: '047' },
    { code: '007', name: 'Kasarani', county_code: '047' },
    { code: '008', name: 'Ruaraka', county_code: '047' },
    { code: '009', name: 'Embakasi South', county_code: '047' },
    { code: '010', name: 'Embakasi North', county_code: '047' },
    { code: '011', name: 'Embakasi Central', county_code: '047' },
    { code: '012', name: 'Embakasi East', county_code: '047' },
    { code: '013', name: 'Embakasi West', county_code: '047' },
    { code: '014', name: 'Makadara', county_code: '047' },
    { code: '015', name: 'Kamukunji', county_code: '047' },
    { code: '016', name: 'Starehe', county_code: '047' },
    { code: '017', name: 'Mathare', county_code: '047' },

    // Mombasa County
    { code: '018', name: 'Changamwe', county_code: '001' },
    { code: '019', name: 'Jomvu', county_code: '001' },
    { code: '020', name: 'Kisauni', county_code: '001' },
    { code: '021', name: 'Nyali', county_code: '001' },
    { code: '022', name: 'Likoni', county_code: '001' },
    { code: '023', name: 'Mvita', county_code: '001' },
  ],

  wards: [
    // Westlands Constituency
    { code: 'W001', name: 'Kitisuru', constituency_code: '001' },
    { code: 'W002', name: 'Parklands/Highridge', constituency_code: '001' },
    { code: 'W003', name: 'Karura', constituency_code: '001' },
    { code: 'W004', name: 'Kangemi', constituency_code: '001' },
    { code: 'W005', name: 'Mountain View', constituency_code: '001' },

    // Langata Constituency
    { code: 'W006', name: 'Karen', constituency_code: '004' },
    { code: 'W007', name: 'Nairobi West', constituency_code: '004' },
    { code: 'W008', name: 'Mugumoini', constituency_code: '004' },
    { code: 'W009', name: 'South C', constituency_code: '004' },
    { code: 'W010', name: 'Nyayo Highrise', constituency_code: '004' },
  ],

  polling_stations: [
    // Kitisuru Ward
    { code: 'PS001', name: 'Muthaiga Primary School', ward_code: 'W001', latitude: -1.2456, longitude: 36.8155 },
    { code: 'PS002', name: 'Kitisuru Community Hall', ward_code: 'W001', latitude: -1.2389, longitude: 36.8234 },
    { code: 'PS003', name: 'Spring Valley School', ward_code: 'W001', latitude: -1.2512, longitude: 36.8178 },

    // Parklands Ward
    { code: 'PS004', name: 'Parklands Primary School', ward_code: 'W002', latitude: -1.2621, longitude: 36.8245 },
    { code: 'PS005', name: 'Highridge Secondary School', ward_code: 'W002', latitude: -1.2678, longitude: 36.8312 },

    // Karen Ward
    { code: 'PS006', name: 'Karen C Primary School', ward_code: 'W006', latitude: -1.3179, longitude: 36.7055 },
    { code: 'PS007', name: 'Hardy Estate Community Hall', ward_code: 'W006', latitude: -1.3234, longitude: 36.7123 },
    { code: 'PS008', name: 'Karen Shopping Center', ward_code: 'W006', latitude: -1.3156, longitude: 36.7089 },
  ],
};

async function clearExistingData() {
  console.log('Clearing existing sample data...');
  await pool.query('DELETE FROM polling_stations WHERE code LIKE \'PS%\'');
  await pool.query('DELETE FROM wards WHERE code LIKE \'W%\'');
  await pool.query('DELETE FROM constituencies');
  await pool.query('DELETE FROM counties');
  console.log('Existing data cleared.');
}

async function seedCounties() {
  console.log(`Seeding ${sampleData.counties.length} counties...`);

  for (const county of sampleData.counties) {
    const result = await pool.query(
      'INSERT INTO counties (code, name) VALUES ($1, $2) RETURNING id',
      [county.code, county.name]
    );
    county.id = result.rows[0].id;
  }

  console.log('Counties seeded successfully!');
}

async function seedConstituencies() {
  console.log(`Seeding ${sampleData.constituencies.length} constituencies...`);

  for (const constituency of sampleData.constituencies) {
    const county = sampleData.counties.find(c => c.code === constituency.county_code);

    const result = await pool.query(
      'INSERT INTO constituencies (code, name, county_id) VALUES ($1, $2, $3) RETURNING id',
      [constituency.code, constituency.name, county.id]
    );
    constituency.id = result.rows[0].id;
  }

  console.log('Constituencies seeded successfully!');
}

async function seedWards() {
  console.log(`Seeding ${sampleData.wards.length} wards...`);

  for (const ward of sampleData.wards) {
    const constituency = sampleData.constituencies.find(c => c.code === ward.constituency_code);

    const result = await pool.query(
      'INSERT INTO wards (code, name, constituency_id) VALUES ($1, $2, $3) RETURNING id',
      [ward.code, ward.name, constituency.id]
    );
    ward.id = result.rows[0].id;
  }

  console.log('Wards seeded successfully!');
}

async function seedPollingStations() {
  console.log(`Seeding ${sampleData.polling_stations.length} polling stations...`);

  for (const station of sampleData.polling_stations) {
    const ward = sampleData.wards.find(w => w.code === station.ward_code);

    await pool.query(
      'INSERT INTO polling_stations (code, name, ward_id, latitude, longitude) VALUES ($1, $2, $3, $4, $5)',
      [station.code, station.name, ward.id, station.latitude, station.longitude]
    );
  }

  console.log('Polling stations seeded successfully!');
}

async function main() {
  try {
    console.log('Starting data seeding...\n');

    await clearExistingData();
    await seedCounties();
    await seedConstituencies();
    await seedWards();
    await seedPollingStations();

    console.log('\n✅ Sample data seeded successfully!');
    console.log('\nSummary:');
    console.log(`  - ${sampleData.counties.length} counties`);
    console.log(`  - ${sampleData.constituencies.length} constituencies`);
    console.log(`  - ${sampleData.wards.length} wards`);
    console.log(`  - ${sampleData.polling_stations.length} polling stations`);

  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
