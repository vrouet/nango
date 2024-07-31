import { expect, describe, it } from 'vitest';
import { exec } from './exec.js';
import type { NangoProps, SyncConfig } from '@nangohq/shared';

describe('Exec', () => {
    it('execute code', async () => {
        const nangoProps: NangoProps = {
            scriptType: 'sync',
            host: 'http://localhost:3003',
            connectionId: 'connection-id',
            environmentId: 1,
            providerConfigKey: 'provider-config-key',
            provider: 'provider',
            activityLogId: '1',
            secretKey: 'secret-key',
            nangoConnectionId: 1,
            syncId: 'sync-id',
            syncJobId: 1,
            lastSyncDate: new Date(),
            dryRun: true,
            attributes: {},
            track_deletes: false,
            logMessages: {
                counts: { updated: 0, added: 0, deleted: 0 },
                messages: []
            },
            syncConfig: {} as SyncConfig,
            debug: false,
            startedAt: new Date(),
            runnerFlags: {} as any,
            stubbedMetadata: {}
        };
        const jsCode = `
        f = async (nango) => {
            const s = nango.lastSyncDate.toISOString();
            const b = Buffer.from("hello world");
            const t = await Promise.resolve(setTimeout(() => {}, 5));
        };
        exports.default = f
        `;
        const res = await exec(nangoProps, jsCode);
        expect(res.error).toEqual(null);
        expect(res.success).toEqual(true);
    });
});
