import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const migration = path => readFile(new URL(`../migrations/${path}`, import.meta.url), 'utf8');

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

function seedIdentity(db) {
  const now = '2026-09-15T04:00:00.000Z';
  db.prepare(`INSERT INTO pathways_organizations
    (organization_id,name,slug,status,timezone,created_at,updated_at)
    VALUES ('org-1','Demo School','demo-school','active','Asia/Kuala_Lumpur',?,?)`).run(now, now);
  db.prepare(`INSERT INTO pathways_users
    (user_id,email,display_name,password_salt,password_hash,password_iterations,is_platform_admin,is_active,created_at,updated_at)
    VALUES ('usr-1','founder@example.test','Founder','00112233445566778899aabbccddeeff',?,160000,1,1,?,?)`)
    .run('a'.repeat(64), now, now);
  db.prepare(`INSERT INTO pathways_memberships
    (membership_id,organization_id,user_id,role,is_active,created_at,updated_at)
    VALUES ('mem-1','org-1','usr-1','admin',1,?,?)`).run(now, now);
  return now;
}

test('Pathways production migrations execute and enforce atomic history plus guarded erasure', async () => {
  const db = setup();
  try {
    db.exec(await migration('0012_pathways_production_beta.sql'));
    db.exec(await migration('0013_pathways_privacy_erasure.sql'));
    const now = seedIdentity(db);

    db.prepare(`INSERT INTO pathways_platform_state(state_key,state_value,created_at)
      VALUES ('bootstrap','usr-1',?)`).run(now);
    assert.throws(
      () => db.prepare(`INSERT INTO pathways_platform_state(state_key,state_value,created_at)
        VALUES ('bootstrap','usr-other',?)`).run(now),
      /UNIQUE constraint failed/,
      'bootstrap sentinel must be single-winner',
    );

    db.prepare(`INSERT INTO pathways_students
      (student_id,organization_id,display_name,external_ref,year_group,status,created_at,updated_at)
      VALUES ('stu-1','org-1','Student A','SYNTHETIC-DEMO','Demo','active',?,?)`).run(now, now);
    const state0 = JSON.stringify({version:'1.0',timetable:{Monday:[],Tuesday:[],Wednesday:[],Thursday:[],Friday:[]},subjects:{},overview:{},pins:[],objectives:[],settings:{timezone:'Asia/Kuala_Lumpur'}});
    db.prepare(`INSERT INTO pathways_student_state
      (student_id,schema_version,revision,state_json,state_hash,updated_at,updated_by,last_action,last_request_id)
      VALUES ('stu-1','1.0',0,?,?,?,'usr-1','create','req-create')`)
      .run(state0, 'b'.repeat(64), now);

    assert.equal(db.prepare(`SELECT COUNT(*) n FROM pathways_state_revisions WHERE student_id='stu-1'`).get().n, 1);
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM pathways_audit_log WHERE student_id='stu-1' AND entity_type='student-state'`).get().n, 1);

    const state1 = state0.replace('"pins":[]', '"pins":[{"id":"pin-1"}]');
    db.prepare(`UPDATE pathways_student_state SET revision=1,state_json=?,state_hash=?,updated_at=?,updated_by='usr-1',last_action='edit',last_request_id='req-edit'
      WHERE student_id='stu-1' AND revision=0`).run(state1, 'c'.repeat(64), '2026-09-15T04:05:00.000Z');
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM pathways_state_revisions WHERE student_id='stu-1'`).get().n, 2);
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM pathways_audit_log WHERE student_id='stu-1' AND entity_type='student-state'`).get().n, 2);

    assert.throws(
      () => db.prepare(`DELETE FROM pathways_state_revisions WHERE student_id='stu-1'`).run(),
      /append-only/,
      'history cannot be deleted outside explicit erasure',
    );
    assert.throws(
      () => db.prepare(`DELETE FROM pathways_audit_log WHERE student_id='stu-1'`).run(),
      /append-only/,
      'audit cannot be deleted outside explicit erasure',
    );

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`INSERT INTO pathways_erasure_guard(student_id,created_at) VALUES ('stu-1',?)`).run(now);
      db.prepare(`INSERT INTO pathways_erasure_log
        (organization_id,erased_student_hash,actor_user_id,reason_code,created_at)
        VALUES ('org-1',?,'usr-1','request',?)`).run('d'.repeat(64), now);
      db.prepare(`DELETE FROM pathways_audit_log WHERE student_id='stu-1'`).run();
      db.prepare(`DELETE FROM pathways_students WHERE student_id='stu-1'`).run();
      db.prepare(`INSERT INTO pathways_audit_log
        (organization_id,student_id,actor_user_id,action,entity_type,entity_id,request_id,metadata_json,created_at)
        VALUES ('org-1',NULL,'usr-1','erase-student','student-erasure',NULL,'erase-req','{"reasonCode":"request"}',?)`).run(now);
      db.prepare(`DELETE FROM pathways_erasure_guard WHERE student_id='stu-1'`).run();
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    assert.equal(db.prepare(`SELECT COUNT(*) n FROM pathways_students WHERE student_id='stu-1'`).get().n, 0);
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM pathways_student_state WHERE student_id='stu-1'`).get().n, 0);
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM pathways_state_revisions WHERE student_id='stu-1'`).get().n, 0);
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM pathways_audit_log WHERE student_id='stu-1'`).get().n, 0);
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM pathways_erasure_log`).get().n, 1);
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM pathways_erasure_guard`).get().n, 0);
  } finally {
    db.close();
  }
});
