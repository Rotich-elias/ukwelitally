#!/usr/bin/env node

/**
 * Seed Ballot Candidates
 *
 * Creates ballot candidates (is_system_user = false) for all positions.
 * These are the actual candidates appearing on the ballot that voters choose from.
 * System user candidates (those with login accounts) do NOT appear on ballots.
 *
 * Usage:
 *   node scripts/seed-ballot-candidates.js
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ukwelitally:dev_password_123@localhost:5432/ukwelitally',
});

async function getLocations() {
  // Get Nairobi county
  const nairobi = await pool.query("SELECT id FROM counties WHERE code = '047'");
  const nairobiCountyId = nairobi.rows[0].id;

  // Get Westlands constituency
  const westlands = await pool.query(
    "SELECT id FROM constituencies WHERE name = 'Westlands' AND county_id = $1",
    [nairobiCountyId]
  );
  const westlandsConstId = westlands.rows[0].id;

  // Get first ward in Westlands
  const ward = await pool.query(
    "SELECT id, name FROM wards WHERE constituency_id = $1 ORDER BY id LIMIT 1",
    [westlandsConstId]
  );
  const wardId = ward.rows[0].id;
  const wardName = ward.rows[0].name;

  return {
    county_id: nairobiCountyId,
    county_name: 'Nairobi',
    constituency_id: westlandsConstId,
    constituency_name: 'Westlands',
    ward_id: wardId,
    ward_name: wardName,
  };
}

async function createBallotCandidate(data) {
  // Check if already exists
  const existing = await pool.query(
    'SELECT id FROM candidates WHERE full_name = $1 AND position = $2 AND is_system_user = false',
    [data.full_name, data.position]
  );

  if (existing.rows.length > 0) {
    console.log(`   ⚠️  ${data.full_name} already exists, skipping...`);
    return null;
  }

  // Create ballot candidate
  const result = await pool.query(
    `INSERT INTO candidates
     (full_name, position, party_name, party_abbreviation, county_id, constituency_id, ward_id, is_system_user)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false)
     RETURNING id`,
    [
      data.full_name,
      data.position,
      data.party_name,
      data.party_abbreviation,
      data.county_id || null,
      data.constituency_id || null,
      data.ward_id || null,
    ]
  );

  console.log(`   ✓ ${data.full_name} (${data.position} - ${data.party_abbreviation})`);
  return result.rows[0].id;
}

async function main() {
  try {
    console.log('\n🗳️  SEEDING BALLOT CANDIDATES');
    console.log('='.repeat(60) + '\n');

    const locations = await getLocations();
    console.log('📍 Using locations:');
    console.log(`   ✓ County: ${locations.county_name}`);
    console.log(`   ✓ Constituency: ${locations.constituency_name}`);
    console.log(`   ✓ Ward: ${locations.ward_name}\n`);

    console.log('👥 Creating ballot candidates...\n');

    // Presidential Candidates (National - no location restriction)
    console.log('Presidential Candidates (National):');
    await createBallotCandidate({
      full_name: 'William Ruto',
      position: 'president',
      party_name: 'United Democratic Alliance',
      party_abbreviation: 'UDA',
    });
    await createBallotCandidate({
      full_name: 'Raila Odinga',
      position: 'president',
      party_name: 'Azimio la Umoja',
      party_abbreviation: 'AZIMIO',
    });
    await createBallotCandidate({
      full_name: 'George Wajackoyah',
      position: 'president',
      party_name: 'Roots Party',
      party_abbreviation: 'ROOTS',
    });
    await createBallotCandidate({
      full_name: 'David Mwaure',
      position: 'president',
      party_name: 'Agano Party',
      party_abbreviation: 'AGANO',
    });

    // Governor Candidates (Nairobi County)
    console.log(`\nGovernor Candidates (${locations.county_name}):`)
    await createBallotCandidate({
      full_name: 'Johnson Sakaja',
      position: 'governor',
      party_name: 'United Democratic Alliance',
      party_abbreviation: 'UDA',
      county_id: locations.county_id,
    });
    await createBallotCandidate({
      full_name: 'Polycarp Igathe',
      position: 'governor',
      party_name: 'Jubilee Party',
      party_abbreviation: 'JP',
      county_id: locations.county_id,
    });
    await createBallotCandidate({
      full_name: 'Nancy Mwadime',
      position: 'governor',
      party_name: 'Ukweli Party',
      party_abbreviation: 'UP',
      county_id: locations.county_id,
    });

    // MP Candidates (Westlands Constituency)
    console.log(`\nMP Candidates (${locations.constituency_name}):`)
    await createBallotCandidate({
      full_name: 'Tim Wanyonyi',
      position: 'mp',
      party_name: 'Orange Democratic Movement',
      party_abbreviation: 'ODM',
      county_id: locations.county_id,
      constituency_id: locations.constituency_id,
    });
    await createBallotCandidate({
      full_name: 'Nelson Havi',
      position: 'mp',
      party_name: 'United Democratic Alliance',
      party_abbreviation: 'UDA',
      county_id: locations.county_id,
      constituency_id: locations.constituency_id,
    });
    await createBallotCandidate({
      full_name: 'Mark Murage',
      position: 'mp',
      party_name: 'Independent',
      party_abbreviation: 'IND',
      county_id: locations.county_id,
      constituency_id: locations.constituency_id,
    });

    // MCA Candidates (Ward level)
    console.log(`\nMCA Candidates (${locations.ward_name}):`)
    await createBallotCandidate({
      full_name: 'Alvin Palapala',
      position: 'mca',
      party_name: 'United Democratic Alliance',
      party_abbreviation: 'UDA',
      county_id: locations.county_id,
      constituency_id: locations.constituency_id,
      ward_id: locations.ward_id,
    });
    await createBallotCandidate({
      full_name: 'Jane Wanjiru',
      position: 'mca',
      party_name: 'Orange Democratic Movement',
      party_abbreviation: 'ODM',
      county_id: locations.county_id,
      constituency_id: locations.constituency_id,
      ward_id: locations.ward_id,
    });
    await createBallotCandidate({
      full_name: 'Peter Kamau',
      position: 'mca',
      party_name: 'Independent',
      party_abbreviation: 'IND',
      county_id: locations.county_id,
      constituency_id: locations.constituency_id,
      ward_id: locations.ward_id,
    });

    // Get summary
    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE position = 'president') as presidential,
        COUNT(*) FILTER (WHERE position = 'governor') as governor,
        COUNT(*) FILTER (WHERE position = 'mp') as mp,
        COUNT(*) FILTER (WHERE position = 'mca') as mca,
        COUNT(*) as total
      FROM candidates
      WHERE is_system_user = false
    `);

    const s = stats.rows[0];

    console.log('\n' + '='.repeat(60));
    console.log('📊 BALLOT CANDIDATES SUMMARY');
    console.log('='.repeat(60));
    console.log(`
  Ballot Candidates by Position:
    • Presidential: ${s.presidential}
    • Governor:     ${s.governor}
    • MP:           ${s.mp}
    • MCA:          ${s.mca}
    ────────────────
    • Total:        ${s.total}

  ℹ️  These are NON-SYSTEM candidates (is_system_user = false)
  ℹ️  These candidates appear on ballot/result forms
  ℹ️  System user candidates do NOT appear on ballots
    `);

    console.log('='.repeat(60));
    console.log('\n✅ BALLOT CANDIDATES SEEDED SUCCESSFULLY!\n');
    console.log('💡 What this means:');
    console.log('   1. When submitting results, only these ballot candidates will appear');
    console.log('   2. System users (with login accounts) are NOT ballot candidates');
    console.log('   3. Agents enter vote counts for these ballot candidates only\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
