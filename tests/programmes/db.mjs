import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function database(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../../migrations/0012_programme_interest.sql',import.meta.url),'utf8'));return {sql,prepare(query){return {bind(...args){return {async run(){const result=sql.prepare(query).run(...args);return {success:true,meta:result};},async all(){return {results:sql.prepare(query).all(...args)};}};},async all(){return {results:sql.prepare(query).all()};},async run(){return sql.prepare(query).run();}};}};}
