#!/usr/bin/env node

/**
 * Helper Script: Get IDs for Agent CSV Import
 *
 * This script helps you find candidate IDs and polling station IDs
 * needed for the agents CSV import file.
 *
 * Usage:
 *   node scripts/get-ids-for-agents-csv.js
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ukwelitally:dev_password_123@localhost:5432/ukwelitally',
});

async function main() {
  try {
    console.log('\n📋 AGENT CSV IMPORT - ID REFERENCE');
    console.log('='.repeat(70) + '\n');

    // Get all candidates with their IDs
    console.log('🎯 CANDIDATE IDs (System Users):');
    console.log('-'.repeat(70));

    const candidates = await pool.query(`
      SELECT
        c.id,
        COALESCE(u.full_name, c.full_name) as name,
        c.position,
        c.party_abbreviation,
        co.name as county,
        con.name as constituency,
        w.name as ward
      FROM candidates c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN counties co ON c.county_id = co.id
      LEFT JOIN constituencies con ON c.constituency_id = con.id
      LEFT JOIN wards w ON c.ward_id = w.id
      WHERE c.is_system_user = true
      ORDER BY c.position, name
    `);

    if (candidates.rows.length === 0) {
      console.log('   ⚠️  No system user candidates found.');
      console.log('   💡 Create candidates first via the admin panel or registration.\n');
    } else {
      candidates.rows.forEach(c => {
        let location = '';
        if (c.position === 'president') {
          location = 'National';
        } else if (c.position === 'governor') {
          location = c.county || 'N/A';
        } else if (c.position === 'mp') {
          location = `${c.constituency || 'N/A'}, ${c.county || 'N/A'}`;
        } else if (c.position === 'mca') {
          location = `${c.ward || 'N/A'}, ${c.constituency || 'N/A'}`;
        }

        console.log(`   ID: ${String(c.id).padEnd(5)} | ${c.position.toUpperCase().padEnd(10)} | ${c.name} (${c.party_abbreviation || 'N/A'}) - ${location}`);
      });
      console.log();
    }

    // Get sample polling stations
    console.log('🏫 POLLING STATION IDs (Sample - First 20):');
    console.log('-'.repeat(70));

    const stations = await pool.query(`
      SELECT
        ps.id,
        ps.code,
        ps.name,
        w.name as ward,
        c.name as constituency,
        co.name as county
      FROM polling_stations ps
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies c ON ps.constituency_id = c.id
      JOIN counties co ON ps.county_id = co.id
      ORDER BY ps.id
      LIMIT 20
    `);

    if (stations.rows.length === 0) {
      console.log('   ⚠️  No polling stations found.');
      console.log('   💡 Run: node scripts/seed-iebc-geography.js\n');
    } else {
      stations.rows.forEach(s => {
        console.log(`   ID: ${String(s.id).padEnd(6)} | ${s.code.padEnd(10)} | ${s.name}`);
        console.log(`   ${''.padEnd(19)} ${s.ward}, ${s.constituency}, ${s.county}`);
      });
      console.log('\n   💡 To see all polling stations: SELECT id, code, name FROM polling_stations;\n');
    }

    // Show CSV format
    console.log('='.repeat(70));
    console.log('📝 CSV FORMAT EXAMPLE:');
    console.log('='.repeat(70));
    console.log('full_name,email,phone,id_number,candidate_id,polling_station_id,is_primary,password');
    console.log('John Doe,john.doe@example.com,+254712345678,12345678,1,1,true,Agent123!');
    console.log('Jane Smith,jane.smith@example.com,+254723456789,23456789,1,2,true,Agent123!');
    console.log();

    console.log('📌 FIELD DESCRIPTIONS:');
    console.log('-'.repeat(70));
    console.log('  full_name            - Agent\'s full name');
    console.log('  email                - Unique email address (for login)');
    console.log('  phone                - Phone number (+254XXXXXXXXX format)');
    console.log('  id_number            - National ID number (must be unique)');
    console.log('  candidate_id         - ID of the candidate this agent works for');
    console.log('  polling_station_id   - ID of the polling station assigned');
    console.log('  is_primary           - true (primary agent) or false (backup agent)');
    console.log('  password             - Login password (optional, defaults to Agent123!)');
    console.log();

    console.log('💾 TEMPLATE FILE:');
    console.log('   Download: public/templates/agents-import-template.csv');
    console.log();

    // Get total counts
    const counts = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM candidates WHERE is_system_user = true) as candidates,
        (SELECT COUNT(*) FROM polling_stations) as polling_stations,
        (SELECT COUNT(*) FROM agents) as existing_agents
    `);

    const c = counts.rows[0];
    console.log('📊 CURRENT DATABASE:');
    console.log('-'.repeat(70));
    console.log(`   System User Candidates:  ${c.candidates}`);
    console.log(`   Polling Stations:        ${c.polling_stations}`);
    console.log(`   Existing Agents:         ${c.existing_agents}`);
    console.log();

    console.log('='.repeat(70));
    console.log('✅ READY TO CREATE CSV FILE!\n');
    console.log('📝 Steps:');
    console.log('   1. Use the candidate IDs and polling station IDs above');
    console.log('   2. Create your CSV file following the format');
    console.log('   3. Upload via: POST /api/agents/import');
    console.log('   4. Or use the admin panel upload interface\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
