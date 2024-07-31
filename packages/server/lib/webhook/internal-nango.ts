import get from 'lodash-es/get.js';
import { environmentService, connectionService, telemetry, getSyncConfigsByConfigIdForWebhook, LogActionEnum, LogTypes } from '@nangohq/shared';
import type { Config as ProviderConfig, SyncConfig, Connection } from '@nangohq/shared';
import type { LogContextGetter } from '@nangohq/logs';
import { getOrchestrator } from '../utils/utils.js';

export interface InternalNango {
    getWebhooks: (environment_id: number, nango_config_id: number) => Promise<SyncConfig[]>;
    executeScriptForWebhooks(
        integration: ProviderConfig,
        query: Record<string, any>,
        body: any,
        webhookType: string,
        connectionIdentifier: string,
        logContextGetter: LogContextGetter,
        propName?: string
    ): Promise<{ connectionIds: string[] }>;
}

export const internalNango: InternalNango = {
    getWebhooks: async (environment_id, nango_config_id) => {
        return await getSyncConfigsByConfigIdForWebhook(environment_id, nango_config_id);
    },
    executeScriptForWebhooks: async (
        integration,
        query,
        body,
        webhookType,
        connectionIdentifier,
        logContextGetter,
        propName
    ): Promise<{ connectionIds: string[] }> => {
        const identifier = get(body, connectionIdentifier) || get(query, connectionIdentifier);
        if (!identifier) {
            await telemetry.log(
                LogTypes.INCOMING_WEBHOOK_ISSUE_WRONG_CONNECTION_IDENTIFIER,
                'Incoming webhook had the wrong connection identifier',
                LogActionEnum.WEBHOOK,
                {
                    environmentId: String(integration.environment_id),
                    provider: integration.provider,
                    providerConfigKey: integration.unique_key,
                    connectionIdentifier,
                    payload: JSON.stringify(body),
                    level: 'error'
                }
            );
            return { connectionIds: [] };
        }

        let connections: Connection[] | null = null;
        if (propName === 'connectionId') {
            const { success, response: connection } = await connectionService.getConnection(identifier, integration.unique_key, integration.environment_id);

            if (success && connection) {
                connections = [connection];
            }
        } else {
            connections = await connectionService.findConnectionsByConnectionConfigValue(
                propName || connectionIdentifier,
                identifier,
                integration.environment_id
            );
        }

        if (!connections || connections.length === 0) {
            await telemetry.log(
                LogTypes.INCOMING_WEBHOOK_ISSUE_CONNECTION_NOT_FOUND,
                'Incoming webhook received but no connection found for it',
                LogActionEnum.WEBHOOK,
                {
                    environmentId: String(integration.environment_id),
                    provider: integration.provider,
                    providerConfigKey: integration.unique_key,
                    propName: String(propName),
                    connectionIdentifier,
                    payload: JSON.stringify(body),
                    level: 'error'
                }
            );

            return { connectionIds: [] };
        }

        const syncConfigsWithWebhooks = await internalNango.getWebhooks(integration.environment_id, integration.id as number);

        if (syncConfigsWithWebhooks.length <= 0) {
            return { connectionIds: connections?.map((connection) => connection.connection_id) };
        }

        const { account, environment } = (await environmentService.getAccountAndEnvironment({ environmentId: integration.environment_id }))!;

        await telemetry.log(LogTypes.INCOMING_WEBHOOK_RECEIVED, 'Incoming webhook received and connection found for it', LogActionEnum.WEBHOOK, {
            accountId: String(account.id),
            environmentId: String(integration.environment_id),
            provider: integration.provider,
            providerConfigKey: integration.unique_key,
            connectionIds: connections.map((connection) => connection.connection_id).join(',')
        });

        const type = get(body, webhookType);

        for (const syncConfig of syncConfigsWithWebhooks) {
            const { webhook_subscriptions } = syncConfig;

            if (!webhook_subscriptions) {
                continue;
            }

            for (const webhook of webhook_subscriptions) {
                if (type === webhook) {
                    for (const connection of connections) {
                        await getOrchestrator().triggerWebhook({
                            account,
                            environment,
                            integration,
                            connection,
                            webhookName: webhook,
                            syncConfig,
                            input: body,
                            logContextGetter
                        });
                    }
                }
            }
        }

        return { connectionIds: connections.map((connection) => connection.connection_id) };
    }
};
