import {randomBytes} from 'node:crypto';
import postgres from 'postgres';

const NAME = 'animalhelper-community-media-cleanup-v1';
const COMMAND = 'select private.invoke_community_media_cleanup()';
const invalid = () => { throw new Error('community_cleanup_configuration_failed'); };

export function cleanupProvisioner(connect = postgres) {
  const session = databaseUrl => connect(databaseUrl, {ssl:'require',max:1,prepare:false,debug:false,connect_timeout:15,idle_timeout:5,onnotice:()=>{},connection:{statement_timeout:30000,lock_timeout:10000}});
  return {
    async prepare(databaseUrl) {
      const sql = session(databaseUrl);
      try {
        const rows = await sql`select decrypted_secret from vault.decrypted_secrets where name=${NAME}`;
        if (rows.length > 1) return invalid();
        const token = rows.length ? rows[0].decrypted_secret : randomBytes(32).toString('base64url');
        if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return invalid();
        return token;
      } catch { return invalid(); } finally { await sql.end({timeout:5}).catch(invalid); }
    },
    async activate(databaseUrl, token) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return invalid();
      const sql = session(databaseUrl);
      try {
        await sql.begin(async tx => {
          await tx`select pg_advisory_xact_lock(417130022)`;
          const rows = await tx`select decrypted_secret from vault.decrypted_secrets where name=${NAME}`;
          if (rows.length > 1 || (rows.length && rows[0].decrypted_secret !== token)) return invalid();
          if (!rows.length) await tx`select vault.create_secret(${token},${NAME},'Bounded community media cleanup capability')`;
          const jobs = await tx`select schedule,command,active,username from cron.job where jobname=${NAME}`;
          if (jobs.length !== 1 || jobs[0].schedule !== '*/15 * * * *' || jobs[0].command !== COMMAND || !jobs[0].active || jobs[0].username !== 'postgres') return invalid();
        });
      } catch { return invalid(); } finally { await sql.end({timeout:5}).catch(invalid); }
    },
  };
}
