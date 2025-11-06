#!/usr/bin/env node

/**
 * Location Data Import Script
 *
 * This script imports Counties, Constituencies, Wards, and Polling Stations
 * from CSV files into the database.
 *
 * Usage:
 *   node scripts/import-locations.js <csv-file> <type>
 *
 * Types: counties, constituencies, wards, polling_stations
 *
 * CSV Format Examples:
 *
 * Counties: code,name
 * Constituencies: code,name,county_id
 * Wards: code,name,constituency_id
 * Polling Stations: code,name,ward_id,latitude,longitude
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'ukwelitally',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'ukwelitally',
  password: process.env.DB_PASSWORD || 'dev_password_123',
  port: process.env.DB_PORT || 5432,
});

function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index];
    });
    return obj;
  });
}

async function importCounties(data) {
  console.log(`Importing ${data.length} counties...`);

  for (const row of data) {
    await pool.query(
      'INSERT INTO counties (code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING',
      [row.code, row.name]
    );
  }

  console.log('Counties imported successfully!');
}

async function importConstituencies(data) {
  console.log(`Importing ${data.length} constituencies...`);

  for (const row of data) {
    await pool.query(
      'INSERT INTO constituencies (code, name, county_id) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING',
      [row.code, row.name, row.county_id]
    );
  }

  console.log('Constituencies imported successfully!');
}

async function importWards(data) {
  console.log(`Importing ${data.length} wards...`);

  for (const row of data) {
    await pool.query(
      'INSERT INTO wards (code, name, constituency_id) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING',
      [row.code, row.name, row.constituency_id]
    );
  }

  console.log('Wards imported successfully!');
}

async function importPollingStations(data) {
  console.log(`Importing ${data.length} polling stations...`);

  for (const row of data) {
    const latitude = row.latitude ? parseFloat(row.latitude) : null;
    const longitude = row.longitude ? parseFloat(row.longitude) : null;

    await pool.query(
      'INSERT INTO polling_stations (code, name, ward_id, latitude, longitude) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (code) DO NOTHING',
      [row.code, row.name, row.ward_id, latitude, longitude]
    );
  }

  console.log('Polling stations imported successfully!');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node import-locations.js <csv-file> <type>');
    console.error('Types: counties, constituencies, wards, polling_stations');
    process.exit(1);
  }

  const [csvFile, type] = args;

  if (!fs.existsSync(csvFile)) {
    console.error(`File not found: ${csvFile}`);
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(csvFile, 'utf-8');
    const data = parseCSV(content);

    switch (type) {
      case 'counties':
        await importCounties(data);
        break;
      case 'constituencies':
        await importConstituencies(data);
        break;
      case 'wards':
        await importWards(data);
        break;
      case 'polling_stations':
        await importPollingStations(data);
        break;
      default:
        console.error(`Unknown type: ${type}`);
        process.exit(1);
    }

    console.log('Import completed!');
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
