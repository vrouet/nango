import jwt from 'jsonwebtoken';
import type { Knex } from '@nangohq/database';
import db, { schema, dbNamespace } from '@nangohq/database';
import analytics, { AnalyticsTypes } from '../utils/analytics.js';
import type { Config as ProviderConfig, AuthCredentials, OAuth1Credentials } from '../models/index.js';
import { LogActionEnum } from '../models/Telemetry.js';
import providerClient from '../clients/provider.client.js';
import configService from './config.service.js';
import syncManager from './sync/manager.service.js';
import environmentService from '../services/environment.service.js';
import { getFreshOAuth2Credentials } from '../clients/oauth2.client.js';
import { NangoError } from '../utils/error.js';

import type { ConnectionConfig, Connection, StoredConnection, BaseConnection, NangoConnection } from '../models/Connection.js';
import type {
    Metadata,
    ActiveLogIds,
    Template as ProviderTemplate,
    TemplateOAuth2 as ProviderTemplateOAuth2,
    AuthModeType,
    TbaCredentials,
    TableauCredentials,
    MaybePromise,
    DBTeam,
    DBEnvironment,
    Template
} from '@nangohq/types';
import { getLogger, stringifyError, Ok, Err, axiosInstance as axios } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { ServiceResponse } from '../models/Generic.js';
import encryptionManager from '../utils/encryption.manager.js';
import telemetry, { LogTypes } from '../utils/telemetry.js';
import type {
    AppCredentials,
    AppStoreCredentials,
    OAuth2Credentials,
    OAuth2ClientCredentials,
    ImportedCredentials,
    ApiKeyCredentials,
    BasicApiCredentials,
    ConnectionUpsertResponse
} from '../models/Auth.js';
import {
    interpolateStringFromObject,
    interpolateString,
    parseTokenExpirationDate,
    isTokenExpired,
    getRedisUrl,
    parseTableauTokenExpirationDate
} from '../utils/utils.js';
import { Locking } from '../utils/lock/locking.js';
import { InMemoryKVStore } from '../utils/kvstore/InMemoryStore.js';
import { RedisKVStore } from '../utils/kvstore/RedisStore.js';
import type { KVStore } from '../utils/kvstore/KVStore.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import { CONNECTIONS_WITH_SCRIPTS_CAP_LIMIT } from '../constants.js';
import type { Orchestrator } from '../clients/orchestrator.js';

const logger = getLogger('Connection');
const ACTIVE_LOG_TABLE = dbNamespace + 'active_logs';
const DEFAULT_EXPIRES_AT_MS = 55 * 60 * 1000; // This ensures we have an expiresAt value

type KeyValuePairs = Record<string, string | boolean>;

class ConnectionService {
    private locking: Locking;

    constructor(locking: Locking) {
        this.locking = locking;
    }

    public async upsertConnection(
        connectionId: string,
        providerConfigKey: string,
        provider: string,
        parsedRawCredentials: AuthCredentials,
        connectionConfig: ConnectionConfig,
        environment_id: number,
        accountId: number,
        metadata?: Metadata
    ): Promise<ConnectionUpsertResponse[]> {
        const storedConnection = await this.checkIfConnectionExists(connectionId, providerConfigKey, environment_id);
        const config_id = await configService.getIdByProviderConfigKey(environment_id, providerConfigKey);

        if (storedConnection) {
            const encryptedConnection = encryptionManager.encryptConnection({
                connection_id: connectionId,
                provider_config_key: providerConfigKey,
                credentials: parsedRawCredentials,
                connection_config: connectionConfig,
                environment_id: environment_id,
                config_id: config_id as number,
                metadata: metadata || storedConnection.metadata || null
            });

            (encryptedConnection as Connection).updated_at = new Date();

            const connection = await db.knex
                .from<StoredConnection>(`_nango_connections`)
                .where({ id: storedConnection.id, deleted: false })
                .update(encryptedConnection)
                .returning('*');

            void analytics.track(AnalyticsTypes.CONNECTION_UPDATED, accountId, { provider });

            return [{ connection: connection[0]!, operation: 'override' }];
        }

        const connection = await db.knex
            .from<StoredConnection>(`_nango_connections`)
            .insert(
                encryptionManager.encryptConnection({
                    connection_id: connectionId,
                    provider_config_key: providerConfigKey,
                    config_id: config_id as number,
                    credentials: parsedRawCredentials,
                    connection_config: connectionConfig,
                    environment_id: environment_id,
                    metadata: metadata || null
                })
            )
            .returning('*');

        void analytics.track(AnalyticsTypes.CONNECTION_INSERTED, accountId, { provider });

        return [{ connection: connection[0]!, operation: 'creation' }];
    }

    public async upsertTbaConnection({
        connectionId,
        providerConfigKey,
        credentials,
        connectionConfig,
        metadata,
        config,
        environment,
        account
    }: {
        connectionId: string;
        providerConfigKey: string;
        credentials: TbaCredentials;
        connectionConfig: ConnectionConfig;
        config: ProviderConfig;
        metadata: Metadata;
        environment: DBEnvironment;
        account: DBTeam;
    }): Promise<ConnectionUpsertResponse[]> {
        const storedConnection = await this.checkIfConnectionExists(connectionId, providerConfigKey, environment.id);

        if (storedConnection) {
            const encryptedConnection = encryptionManager.encryptConnection({
                connection_id: connectionId,
                config_id: config.id as number,
                provider_config_key: providerConfigKey,
                metadata,
                credentials,
                connection_config: connectionConfig,
                environment_id: environment.id
            });
            (encryptedConnection as Connection).updated_at = new Date();
            const connection = await db.knex
                .from<StoredConnection>(`_nango_connections`)
                .where({ id: storedConnection.id, deleted: false })
                .update(encryptedConnection)
                .returning('*');

            void analytics.track(AnalyticsTypes.TBA_CONNECTION_INSERTED, account.id, { provider: config.provider });

            return [{ connection: connection[0]!, operation: 'override' }];
        }
        const connection = await db.knex
            .from<StoredConnection>(`_nango_connections`)
            .insert(
                encryptionManager.encryptConnection({
                    connection_id: connectionId,
                    provider_config_key: providerConfigKey,
                    config_id: config.id as number,
                    credentials,
                    metadata,
                    connection_config: connectionConfig,
                    environment_id: environment.id
                })
            )
            .returning('*');

        void analytics.track(AnalyticsTypes.TBA_CONNECTION_INSERTED, account.id, { provider: config.provider });

        return [{ connection: connection[0]!, operation: 'creation' }];
    }

    public async upsertTableauConnection({
        connectionId,
        providerConfigKey,
        credentials,
        connectionConfig,
        metadata,
        config,
        environment,
        account
    }: {
        connectionId: string;
        providerConfigKey: string;
        credentials: TableauCredentials;
        connectionConfig: ConnectionConfig;
        config: ProviderConfig;
        metadata: Metadata;
        environment: DBEnvironment;
        account: DBTeam;
    }): Promise<ConnectionUpsertResponse[]> {
        const storedConnection = await this.checkIfConnectionExists(connectionId, providerConfigKey, environment.id);

        if (storedConnection) {
            const encryptedConnection = encryptionManager.encryptConnection({
                connection_id: connectionId,
                config_id: config.id as number,
                provider_config_key: providerConfigKey,
                metadata,
                credentials,
                connection_config: connectionConfig,
                environment_id: environment.id
            });
            (encryptedConnection as Connection).updated_at = new Date();
            const connection = await db.knex
                .from<StoredConnection>(`_nango_connections`)
                .where({ id: storedConnection.id, deleted: false })
                .update(encryptedConnection)
                .returning('*');

            void analytics.track(AnalyticsTypes.TABLEAU_CONNECTION_INSERTED, account.id, { provider: config.provider });

            return [{ connection: connection[0]!, operation: 'override' }];
        }
        const connection = await db.knex
            .from<StoredConnection>(`_nango_connections`)
            .insert(
                encryptionManager.encryptConnection({
                    connection_id: connectionId,
                    provider_config_key: providerConfigKey,
                    config_id: config.id as number,
                    credentials,
                    metadata,
                    connection_config: connectionConfig,
                    environment_id: environment.id
                })
            )
            .returning('*');

        void analytics.track(AnalyticsTypes.TABLEAU_CONNECTION_INSERTED, account.id, { provider: config.provider });

        return [{ connection: connection[0]!, operation: 'creation' }];
    }

    public async upsertApiConnection(
        connectionId: string,
        providerConfigKey: string,
        provider: string,
        credentials: ApiKeyCredentials | BasicApiCredentials,
        connectionConfig: Record<string, string>,
        environment_id: number,
        accountId: number
    ): Promise<ConnectionUpsertResponse[]> {
        const storedConnection = await this.checkIfConnectionExists(connectionId, providerConfigKey, environment_id);
        const config_id = await configService.getIdByProviderConfigKey(environment_id, providerConfigKey); // TODO remove that

        if (storedConnection) {
            const encryptedConnection = encryptionManager.encryptConnection({
                connection_id: connectionId,
                config_id: config_id as number,
                provider_config_key: providerConfigKey,
                credentials,
                connection_config: connectionConfig,
                environment_id
            });
            (encryptedConnection as Connection).updated_at = new Date();
            const connection = await db.knex
                .from<StoredConnection>(`_nango_connections`)
                .where({ id: storedConnection.id, deleted: false })
                .update(encryptedConnection)
                .returning('*');

            void analytics.track(AnalyticsTypes.API_CONNECTION_UPDATED, accountId, { provider });

            return [{ connection: connection[0]!, operation: 'override' }];
        }
        const connection = await db.knex
            .from<StoredConnection>(`_nango_connections`)
            .insert(
                encryptionManager.encryptApiConnection({
                    connection_id: connectionId,
                    provider_config_key: providerConfigKey,
                    config_id: config_id as number,
                    credentials,
                    connection_config: connectionConfig,
                    environment_id
                })
            )
            .returning('*');

        void analytics.track(AnalyticsTypes.API_CONNECTION_INSERTED, accountId, { provider });

        return [{ connection: connection[0]!, operation: 'creation' }];
    }

    public async upsertUnauthConnection(
        connectionId: string,
        providerConfigKey: string,
        provider: string,
        environment_id: number,
        accountId: number
    ): Promise<ConnectionUpsertResponse[]> {
        const storedConnection = await this.checkIfConnectionExists(connectionId, providerConfigKey, environment_id);
        const config_id = await configService.getIdByProviderConfigKey(environment_id, providerConfigKey); // TODO remove that

        if (storedConnection) {
            const connection = await db.knex
                .from<StoredConnection>(`_nango_connections`)
                .where({ id: storedConnection.id, deleted: false })
                .update({
                    connection_id: connectionId,
                    provider_config_key: providerConfigKey,
                    config_id: config_id as number,
                    updated_at: new Date()
                })
                .returning('*');

            void analytics.track(AnalyticsTypes.UNAUTH_CONNECTION_UPDATED, accountId, { provider });

            return [{ connection: connection[0]!, operation: 'override' }];
        }
        const connection = await db.knex
            .from<StoredConnection>(`_nango_connections`)
            .insert({
                connection_id: connectionId,
                provider_config_key: providerConfigKey,
                credentials: {},
                connection_config: {},
                environment_id,
                config_id: config_id!
            })
            .returning('*');

        void analytics.track(AnalyticsTypes.UNAUTH_CONNECTION_INSERTED, accountId, { provider });

        return [{ connection: connection[0]!, operation: 'creation' }];
    }

    public async importOAuthConnection(
        connection_id: string,
        provider_config_key: string,
        provider: string,
        environmentId: number,
        accountId: number,
        parsedRawCredentials: ImportedCredentials,
        connectionCreatedHook: (res: ConnectionUpsertResponse) => MaybePromise<void>
    ) {
        const { connection_config, metadata } = parsedRawCredentials as Partial<Pick<BaseConnection, 'metadata' | 'connection_config'>>;

        const [importedConnection] = await this.upsertConnection(
            connection_id,
            provider_config_key,
            provider,
            parsedRawCredentials,
            connection_config || {},
            environmentId,
            accountId,
            metadata || undefined
        );

        if (importedConnection) {
            void connectionCreatedHook(importedConnection);
        }

        return [importedConnection];
    }

    public async importApiAuthConnection(
        connection_id: string,
        provider_config_key: string,
        provider: string,
        environmentId: number,
        accountId: number,
        credentials: BasicApiCredentials | ApiKeyCredentials,
        connectionCreatedHook: (res: ConnectionUpsertResponse) => MaybePromise<void>
    ) {
        const [importedConnection] = await this.upsertApiConnection(connection_id, provider_config_key, provider, credentials, {}, environmentId, accountId);

        if (importedConnection) {
            void connectionCreatedHook(importedConnection);
        }

        return [importedConnection];
    }

    public async getConnectionById(
        id: number
    ): Promise<Pick<Connection, 'id' | 'connection_id' | 'provider_config_key' | 'environment_id' | 'connection_config' | 'metadata'> | null> {
        const result = await schema()
            .select('id', 'connection_id', 'provider_config_key', 'environment_id', 'connection_config', 'metadata')
            .from<StoredConnection>('_nango_connections')
            .where({ id: id, deleted: false });

        if (!result || result.length == 0 || !result[0]) {
            return null;
        }

        return result[0];
    }

    public async checkIfConnectionExists(
        connection_id: string,
        provider_config_key: string,
        environment_id: number
    ): Promise<null | { id: number; metadata: Metadata }> {
        const result = await schema().select('id', 'metadata').from<StoredConnection>('_nango_connections').where({
            connection_id,
            provider_config_key,
            environment_id,
            deleted: false
        });

        if (!result || result.length == 0 || !result[0]) {
            return null;
        }

        return result[0];
    }

    public async getConnection(connectionId: string, providerConfigKey: string, environment_id: number): Promise<ServiceResponse<Connection>> {
        if (!environment_id) {
            const error = new NangoError('missing_environment');

            return { success: false, error, response: null };
        }

        if (!connectionId) {
            const error = new NangoError('missing_connection');

            await telemetry.log(LogTypes.GET_CONNECTION_FAILURE, error.message, LogActionEnum.AUTH, {
                environmentId: String(environment_id),
                connectionId,
                providerConfigKey,
                level: 'error'
            });

            return { success: false, error, response: null };
        }

        if (!providerConfigKey) {
            const error = new NangoError('missing_provider_config');

            await telemetry.log(LogTypes.GET_CONNECTION_FAILURE, error.message, LogActionEnum.AUTH, {
                environmentId: String(environment_id),
                connectionId,
                providerConfigKey,
                level: 'error'
            });

            return { success: false, error, response: null };
        }

        const result: StoredConnection[] | null = (await schema()
            .select('*')
            .from<StoredConnection>(`_nango_connections`)
            .where({ connection_id: connectionId, provider_config_key: providerConfigKey, environment_id, deleted: false })) as unknown as StoredConnection[];

        const storedConnection = result == null || result.length == 0 ? null : result[0] || null;

        if (!storedConnection) {
            const environmentName = await environmentService.getEnvironmentName(environment_id);

            const error = new NangoError('unknown_connection', { connectionId, providerConfigKey, environmentName });

            await telemetry.log(LogTypes.GET_CONNECTION_FAILURE, error.message, LogActionEnum.AUTH, {
                environmentId: String(environment_id),
                connectionId,
                providerConfigKey,
                level: 'error'
            });

            return { success: false, error, response: null };
        }

        const connection = encryptionManager.decryptConnection(storedConnection);

        // Parse the token expiration date.
        if (connection != null) {
            const credentials = connection.credentials as OAuth1Credentials | OAuth2Credentials | AppCredentials | OAuth2ClientCredentials | TableauCredentials;
            if (credentials.type && credentials.type === 'OAUTH2') {
                const creds = credentials;
                creds.expires_at = creds.expires_at != null ? parseTokenExpirationDate(creds.expires_at) : undefined;
                connection.credentials = creds;
            }

            if (credentials.type && credentials.type === 'APP') {
                const creds = credentials;
                creds.expires_at = creds.expires_at != null ? parseTokenExpirationDate(creds.expires_at) : undefined;
                connection.credentials = creds;
            }

            if (credentials.type && credentials.type === 'OAUTH2_CC') {
                const creds = credentials;
                creds.expires_at = creds.expires_at != null ? parseTokenExpirationDate(creds.expires_at) : undefined;
                connection.credentials = creds;
            }

            if (credentials.type && credentials.type === 'TABLEAU') {
                const creds = credentials;
                creds.expires_at = creds.expires_at != null ? parseTokenExpirationDate(creds.expires_at) : undefined;
                connection.credentials = creds;
            }
        }

        return { success: true, error: null, response: connection };
    }

    public async updateConnection(connection: Connection) {
        await db.knex
            .from<StoredConnection>(`_nango_connections`)
            .where({
                connection_id: connection.connection_id,
                provider_config_key: connection.provider_config_key,
                environment_id: connection.environment_id,
                deleted: false
            })
            .update(encryptionManager.encryptConnection(connection));
    }

    public async getMetadata(connection: Connection): Promise<Record<string, string>> {
        const result = await db.knex.from<StoredConnection>(`_nango_connections`).select('metadata').where({
            connection_id: connection.connection_id,
            provider_config_key: connection.provider_config_key,
            environment_id: connection.environment_id,
            deleted: false
        });

        if (!result || result.length == 0 || !result[0]) {
            return {};
        }

        return result[0].metadata;
    }

    public async getConnectionConfig(connection: Pick<Connection, 'connection_id' | 'provider_config_key' | 'environment_id'>): Promise<ConnectionConfig> {
        const result = await db.knex.from<StoredConnection>(`_nango_connections`).select('connection_config').where({
            connection_id: connection.connection_id,
            provider_config_key: connection.provider_config_key,
            environment_id: connection.environment_id,
            deleted: false
        });

        if (!result || result.length == 0 || !result[0]) {
            return {};
        }

        return result[0].connection_config;
    }

    public async getConnectionsByEnvironmentAndConfig(environment_id: number, providerConfigKey: string): Promise<NangoConnection[]> {
        const result = await db.knex
            .from<StoredConnection>(`_nango_connections`)
            .select('id', 'connection_id', 'provider_config_key', 'environment_id', 'connection_config')
            .where({ environment_id, provider_config_key: providerConfigKey, deleted: false });

        if (!result || result.length == 0 || !result[0]) {
            return [];
        }

        return result;
    }

    public async getOldConnections({
        days,
        limit
    }: {
        days: number;
        limit: number;
    }): Promise<{ connection_id: string; provider_config_key: string; account: DBTeam; environment: DBEnvironment }[]> {
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - days);

        type T = Awaited<ReturnType<ConnectionService['getOldConnections']>>;

        const result = await db
            .knex<StoredConnection>(`_nango_connections`)
            .join('_nango_configs', '_nango_connections.config_id', '_nango_configs.id')
            .join('_nango_environments', '_nango_connections.environment_id', '_nango_environments.id')
            .join('_nango_accounts', '_nango_environments.account_id', '_nango_accounts.id')
            .select<T>(
                'connection_id',
                'unique_key as provider_config_key',
                db.knex.raw('row_to_json(_nango_environments.*) as environment'),
                db.knex.raw('row_to_json(_nango_accounts.*) as account')
            )
            .where('_nango_connections.deleted', false)
            .andWhere((builder) => builder.where('last_fetched_at', '<', dateThreshold).orWhereNull('last_fetched_at'))
            .limit(limit);

        return result || [];
    }

    public async replaceMetadata(ids: number[], metadata: Metadata, trx: Knex.Transaction) {
        await trx.from<StoredConnection>(`_nango_connections`).whereIn('id', ids).andWhere({ deleted: false }).update({ metadata });
    }

    public async replaceConnectionConfig(connection: Connection, config: ConnectionConfig) {
        await db.knex
            .from<StoredConnection>(`_nango_connections`)
            .where({ id: connection.id as number, deleted: false })
            .update({ connection_config: config });
    }

    public async updateMetadata(connections: Connection[], metadata: Metadata): Promise<void> {
        await db.knex.transaction(async (trx) => {
            for (const connection of connections) {
                const newMetadata = { ...connection.metadata, ...metadata };
                await this.replaceMetadata([connection.id as number], newMetadata, trx);
            }
        });
    }

    public async updateConnectionConfig(connection: Connection, config: ConnectionConfig): Promise<ConnectionConfig> {
        const existingConfig = await this.getConnectionConfig(connection);
        const newConfig = { ...existingConfig, ...config };
        await this.replaceConnectionConfig(connection, newConfig);

        return newConfig;
    }

    public async findConnectionsByConnectionConfigValue(key: string, value: string, environmentId: number): Promise<Connection[] | null> {
        const result = await db.knex
            .from<StoredConnection>(`_nango_connections`)
            .select('*')
            .where({ environment_id: environmentId })
            .whereRaw(`connection_config->>:key = :value AND deleted = false`, { key, value });

        if (!result || result.length == 0) {
            return null;
        }

        return result.map((connection) => encryptionManager.decryptConnection(connection) as Connection);
    }

    public async findConnectionsByMultipleConnectionConfigValues(keyValuePairs: KeyValuePairs, environmentId: number): Promise<Connection[] | null> {
        let query = db.knex.from<StoredConnection>(`_nango_connections`).select('*').where({ environment_id: environmentId });

        Object.entries(keyValuePairs).forEach(([key, value]) => {
            query = query.andWhereRaw(`connection_config->>:key = :value AND deleted = false`, { key, value });
        });

        const result = await query;

        if (!result || result.length == 0) {
            return null;
        }

        return result.map((connection) => encryptionManager.decryptConnection(connection) as Connection);
    }

    public async listConnections(
        environment_id: number,
        connectionId?: string
    ): Promise<{ id: number; connection_id: string; provider: string; created: string; metadata: Metadata; active_logs: ActiveLogIds }[]> {
        const queryBuilder = db.knex
            .from<Connection>(`_nango_connections`)
            .select(
                { id: '_nango_connections.id' },
                { connection_id: '_nango_connections.connection_id' },
                { provider: '_nango_connections.provider_config_key' },
                { created: '_nango_connections.created_at' },
                '_nango_connections.metadata',
                db.knex.raw(`
                  (SELECT json_build_object(
                      'log_id', log_id
                    )
                    FROM ${ACTIVE_LOG_TABLE}
                    WHERE _nango_connections.id = ${ACTIVE_LOG_TABLE}.connection_id
                      AND ${ACTIVE_LOG_TABLE}.active = true
                    LIMIT 1
                  ) as active_logs
                `)
            )
            .where({
                environment_id: environment_id,
                deleted: false
            })
            .groupBy(
                '_nango_connections.id',
                '_nango_connections.connection_id',
                '_nango_connections.provider_config_key',
                '_nango_connections.created_at',
                '_nango_connections.metadata'
            );

        if (connectionId) {
            queryBuilder.where({
                connection_id: connectionId
            });
        }

        return queryBuilder;
    }

    public async getAllNames(environment_id: number): Promise<string[]> {
        const connections = await this.listConnections(environment_id);
        return [...new Set(connections.map((config) => config.connection_id))];
    }

    public async deleteConnection(connection: Connection, providerConfigKey: string, environment_id: number, orchestrator: Orchestrator): Promise<number> {
        const del = await db.knex
            .from<Connection>(`_nango_connections`)
            .where({
                connection_id: connection.connection_id,
                provider_config_key: providerConfigKey,
                environment_id,
                deleted: false
            })
            .update({ deleted: true, credentials: {}, credentials_iv: null, credentials_tag: null, deleted_at: new Date() });

        await syncManager.softDeleteSyncsByConnection(connection, orchestrator);

        return del;
    }

    public async getConnectionCredentials({
        account,
        environment,
        connectionId,
        providerConfigKey,
        logContextGetter,
        instantRefresh,
        onRefreshSuccess,
        onRefreshFailed
    }: {
        account: DBTeam;
        environment: DBEnvironment;
        connectionId: string;
        providerConfigKey: string;
        logContextGetter: LogContextGetter;
        instantRefresh: boolean;
        onRefreshSuccess: (args: { connection: Connection; environment: DBEnvironment; config: ProviderConfig }) => Promise<void>;
        onRefreshFailed: (args: {
            connection: Connection;
            logCtx: LogContext;
            authError: { type: string; description: string };
            environment: DBEnvironment;
            template: ProviderTemplate;
            config: ProviderConfig;
        }) => Promise<void>;
    }): Promise<Result<Connection, NangoError>> {
        if (connectionId === null) {
            const error = new NangoError('missing_connection');

            return Err(error);
        }

        if (providerConfigKey === null) {
            const error = new NangoError('missing_provider_config');

            return Err(error);
        }

        const { success, error, response: connection } = await this.getConnection(connectionId, providerConfigKey, environment.id);

        if (!success && error) {
            return Err(error);
        }

        if (connection === null || !connection.id) {
            const error = new NangoError('unknown_connection', { connectionId, providerConfigKey, environmentName: environment.name });

            return Err(error);
        }

        const config: ProviderConfig | null = await configService.getProviderConfig(connection?.provider_config_key, environment.id);

        if (config === null || !config.id) {
            const error = new NangoError('unknown_provider_config');
            return Err(error);
        }

        const template: ProviderTemplate = configService.getTemplate(config?.provider);

        if (
            connection?.credentials?.type === 'OAUTH2' ||
            connection?.credentials?.type === 'APP' ||
            connection?.credentials?.type === 'OAUTH2_CC' ||
            connection?.credentials?.type === 'TABLEAU'
        ) {
            const { success, error, response } = await this.refreshCredentialsIfNeeded({
                connectionId: connection.connection_id,
                environmentId: environment.id,
                providerConfig: config,
                template: template as ProviderTemplateOAuth2,
                environment_id: environment.id,
                instantRefresh
            });

            if ((!success && error) || !response) {
                const logCtx = await logContextGetter.create(
                    { operation: { type: 'auth', action: 'refresh_token' }, message: 'Token refresh error' },
                    {
                        account,
                        environment,
                        integration: config ? { id: config.id, name: config.unique_key, provider: config.provider } : undefined,
                        connection: { id: connection.id, name: connection.connection_id }
                    }
                );

                await logCtx.error('Failed to refresh credentials', error);
                await logCtx.failed();

                if (logCtx) {
                    await onRefreshFailed({
                        connection,
                        logCtx,
                        authError: {
                            type: error!.type,
                            description: error!.message
                        },
                        environment,
                        template,
                        config
                    });
                }

                // TODO: this leak credentials to the logs
                const errorWithPayload = new NangoError(error!.type, connection);

                // there was an attempt to refresh the token so clear it from the queue
                // of connections to refresh if it failed
                await this.updateLastFetched(connection.id);

                return Err(errorWithPayload);
            } else if (response.refreshed) {
                await onRefreshSuccess({
                    connection,
                    environment,
                    config
                });
            }

            connection.credentials = response.credentials as OAuth2Credentials;
        }

        await this.updateLastFetched(connection.id);

        return Ok(connection);
    }

    public async updateLastFetched(id: number) {
        await db.knex.from<Connection>(`_nango_connections`).where({ id, deleted: false }).update({ last_fetched_at: new Date() });
    }

    // Parses and arbitrary object (e.g. a server response or a user provided auth object) into AuthCredentials.
    // Throws if values are missing/missing the input is malformed.
    public parseRawCredentials(rawCredentials: object, authMode: AuthModeType): AuthCredentials {
        const rawCreds = rawCredentials as Record<string, any>;

        switch (authMode) {
            case 'OAUTH2': {
                if (!rawCreds['access_token']) {
                    throw new NangoError(`incomplete_raw_credentials`);
                }

                let expiresAt: Date | undefined;

                if (rawCreds['expires_at']) {
                    expiresAt = parseTokenExpirationDate(rawCreds['expires_at']);
                } else if (rawCreds['expires_in']) {
                    expiresAt = new Date(Date.now() + Number.parseInt(rawCreds['expires_in'], 10) * 1000);
                }

                const oauth2Creds: OAuth2Credentials = {
                    type: 'OAUTH2',
                    access_token: rawCreds['access_token'],
                    refresh_token: rawCreds['refresh_token'],
                    expires_at: expiresAt,
                    raw: rawCreds
                };

                return oauth2Creds;
            }

            case 'OAUTH1': {
                if (!rawCreds['oauth_token'] || !rawCreds['oauth_token_secret']) {
                    throw new NangoError(`incomplete_raw_credentials`);
                }

                const oauth1Creds: OAuth1Credentials = {
                    type: 'OAUTH1',
                    oauth_token: rawCreds['oauth_token'],
                    oauth_token_secret: rawCreds['oauth_token_secret'],
                    raw: rawCreds
                };

                return oauth1Creds;
            }

            case 'OAUTH2_CC': {
                if (!rawCreds['access_token'] && !(rawCreds['data'] && rawCreds['data']['token']) && !rawCreds['jwt']) {
                    throw new NangoError(`incomplete_raw_credentials`);
                }

                let expiresAt: Date | undefined;

                if (rawCreds['expires_at']) {
                    expiresAt = parseTokenExpirationDate(rawCreds['expires_at']);
                } else if (rawCreds['expires_in']) {
                    expiresAt = new Date(Date.now() + Number.parseInt(rawCreds['expires_in'], 10) * 1000);
                } else {
                    expiresAt = new Date(Date.now() + DEFAULT_EXPIRES_AT_MS);
                }

                const oauth2Creds: OAuth2ClientCredentials = {
                    type: 'OAUTH2_CC',
                    token: rawCreds['access_token'] || (rawCreds['data'] && rawCreds['data']['token']) || rawCreds['jwt'],
                    client_id: '',
                    client_secret: '',
                    expires_at: expiresAt,
                    raw: rawCreds
                };

                return oauth2Creds;
            }

            case 'TABLEAU': {
                if (!rawCreds['credentials']['token']) {
                    throw new NangoError(`incomplete_raw_credentials`);
                }
                let expiresAt: Date | undefined;
                if (rawCreds['credentials']['estimatedTimeToExpiration']) {
                    expiresAt = parseTableauTokenExpirationDate(rawCreds['credentials']['estimatedTimeToExpiration']);
                }
                const tableauCredentials: TableauCredentials = {
                    type: 'TABLEAU',
                    token: rawCreds['credentials']['token'],
                    expires_at: expiresAt,
                    raw: rawCreds,
                    pat_name: '',
                    pat_secret: '',
                    content_url: ''
                };
                return tableauCredentials;
            }

            default:
                throw new NangoError(`Cannot parse credentials, unknown credentials type: ${JSON.stringify(rawCreds, undefined, 2)}`);
        }
    }

    private async refreshCredentialsIfNeeded({
        connectionId,
        environmentId,
        providerConfig,
        template,
        environment_id,
        instantRefresh = false
    }: {
        connectionId: string;
        environmentId: number;
        providerConfig: ProviderConfig;
        template: ProviderTemplateOAuth2;
        environment_id: number;
        instantRefresh?: boolean;
    }): Promise<
        ServiceResponse<{
            refreshed: boolean;
            credentials: OAuth2Credentials | AppCredentials | AppStoreCredentials | OAuth2ClientCredentials | TableauCredentials;
        }>
    > {
        const providerConfigKey = providerConfig.unique_key;

        // fetch connection and return credentials if they are fresh
        const getConnectionAndFreshCredentials = async (): Promise<{
            connection: Connection;
            freshCredentials: OAuth2Credentials | AppCredentials | AppStoreCredentials | OAuth2ClientCredentials | TableauCredentials | null;
        }> => {
            const { success, error, response: connection } = await this.getConnection(connectionId, providerConfigKey, environmentId);

            if (!success || !connection) {
                throw error;
            }

            const shouldRefresh = await this.shouldRefreshCredentials(
                connection,
                connection.credentials as OAuth2Credentials,
                providerConfig,
                template,
                instantRefresh
            );

            return {
                connection,
                freshCredentials: shouldRefresh
                    ? null
                    : (connection.credentials as OAuth2Credentials | AppCredentials | AppStoreCredentials | OAuth2ClientCredentials | TableauCredentials)
            };
        };

        // We must ensure that only one refresh is running at a time
        // Using a simple redis entry as a lock with a TTL to ensure it is always released.
        // NOTES:
        // - This is not a distributed lock and will not work in a multi-redis environment.
        // - It could also be unsafe in case of a Redis crash.
        const lockKey = `lock:refresh:${environment_id}:${providerConfigKey}:${connectionId}`;
        try {
            const ttlInMs = 10000;
            const acquisitionTimeoutMs = ttlInMs * 1.2; // giving some extra time for the lock to be released

            let connectionToRefresh: Connection;
            try {
                await this.locking.tryAcquire(lockKey, ttlInMs, acquisitionTimeoutMs);
                // Another refresh was running so we check if the credentials were refreshed
                // If yes, we return the new credentials
                // If not, we proceed with the refresh
                const { connection, freshCredentials } = await getConnectionAndFreshCredentials();
                if (freshCredentials) {
                    return { success: true, error: null, response: { refreshed: false, credentials: freshCredentials } };
                }
                connectionToRefresh = connection;
            } catch (err) {
                // lock acquisition might have timed out
                // but refresh might have been successfully performed by another execution
                // while we were waiting for the lock
                // so we check if the credentials were refreshed
                // if yes, we return the new credentials
                // if not, we actually fail the refresh
                const { freshCredentials } = await getConnectionAndFreshCredentials();
                if (freshCredentials) {
                    return { success: true, error: null, response: { refreshed: false, credentials: freshCredentials } };
                }
                throw err;
            }

            await telemetry.log(LogTypes.AUTH_TOKEN_REFRESH_START, 'Token refresh is being started', LogActionEnum.AUTH, {
                environmentId: String(environment_id),
                connectionId,
                providerConfigKey,
                provider: providerConfig.provider
            });

            const { success, error, response: newCredentials } = await this.getNewCredentials(connectionToRefresh, providerConfig, template);
            if (!success || !newCredentials) {
                await telemetry.log(LogTypes.AUTH_TOKEN_REFRESH_FAILURE, `Token refresh failed, ${error?.message}`, LogActionEnum.AUTH, {
                    environmentId: String(environment_id),
                    connectionId,
                    providerConfigKey,
                    provider: providerConfig.provider,
                    level: 'error'
                });

                return { success, error, response: null };
            }

            connectionToRefresh.credentials = newCredentials;
            await this.updateConnection(connectionToRefresh);

            await telemetry.log(LogTypes.AUTH_TOKEN_REFRESH_SUCCESS, 'Token refresh was successful', LogActionEnum.AUTH, {
                environmentId: String(environment_id),
                connectionId,
                providerConfigKey,
                provider: providerConfig.provider
            });

            return { success: true, error: null, response: { refreshed: true, credentials: newCredentials } };
        } catch (err) {
            await telemetry.log(LogTypes.AUTH_TOKEN_REFRESH_FAILURE, `Token refresh failed, ${stringifyError(err)}`, LogActionEnum.AUTH, {
                environmentId: String(environment_id),
                connectionId,
                providerConfigKey,
                provider: providerConfig.provider,
                level: 'error'
            });

            const error = new NangoError('refresh_token_external_error', { message: err instanceof Error ? err.message : 'unknown error' });

            return { success: false, error, response: null };
        } finally {
            await this.locking.release(lockKey);
        }
    }

    public async getAppStoreCredentials(
        template: ProviderTemplate,
        connectionConfig: Connection['connection_config'],
        privateKey: string
    ): Promise<ServiceResponse<AppStoreCredentials>> {
        const templateTokenUrl = typeof template.token_url === 'string' ? template.token_url : (template.token_url!['APP_STORE'] as string);
        const tokenUrl = interpolateStringFromObject(templateTokenUrl, { connectionConfig });

        const now = Math.floor(Date.now() / 1000);
        const expiration = now + 15 * 60;

        const payload: Record<string, string | number> = {
            iat: now,
            exp: expiration,
            iss: connectionConfig['issuerId']
        };

        if (template.authorization_params && template.authorization_params['audience']) {
            payload['aud'] = template.authorization_params['audience'];
        }

        if (connectionConfig['scope']) {
            payload['scope'] = connectionConfig['scope'];
        }

        const {
            success,
            error,
            response: rawCredentials
        } = await this.getJWTCredentials(privateKey, tokenUrl, payload, null, {
            header: {
                alg: 'ES256',
                kid: connectionConfig['privateKeyId'],
                typ: 'JWT'
            }
        });

        if (!success || !rawCredentials) {
            return { success, error, response: null };
        }

        const credentials: AppStoreCredentials = {
            type: 'APP_STORE',
            access_token: rawCredentials?.token,
            private_key: Buffer.from(privateKey).toString('base64'),
            expires_at: rawCredentials?.expires_at,
            raw: rawCredentials as unknown as Record<string, unknown>
        };

        return { success: true, error: null, response: credentials };
    }

    public async getAppCredentialsAndFinishConnection(
        connectionId: string,
        integration: ProviderConfig,
        template: ProviderTemplate,
        connectionConfig: ConnectionConfig,
        logCtx: LogContext,
        connectionCreatedHook: (res: ConnectionUpsertResponse) => MaybePromise<void>
    ): Promise<void> {
        const { success, error, response: credentials } = await this.getAppCredentials(template, integration, connectionConfig);

        if (!success || !credentials) {
            logger.error(error);
            return;
        }

        const accountId = await environmentService.getAccountIdFromEnvironment(integration.environment_id);

        const [updatedConnection] = await this.upsertConnection(
            connectionId,
            integration.unique_key,
            integration.provider,
            credentials as unknown as AuthCredentials,
            connectionConfig,
            integration.environment_id,
            accountId as number
        );

        if (updatedConnection) {
            void connectionCreatedHook(updatedConnection);
        }

        await logCtx.info('App connection was approved and credentials were saved');
    }

    public async getAppCredentials(
        template: ProviderTemplate,
        config: ProviderConfig,
        connectionConfig: Connection['connection_config']
    ): Promise<ServiceResponse<AppCredentials>> {
        const templateTokenUrl = typeof template.token_url === 'string' ? template.token_url : (template.token_url!['APP'] as string);

        const tokenUrl = interpolateStringFromObject(templateTokenUrl, { connectionConfig });
        const privateKeyBase64 = config?.custom ? config.custom['private_key'] : config.oauth_client_secret;

        const privateKey = Buffer.from(privateKeyBase64 as string, 'base64').toString('utf8');

        const headers = {
            Accept: 'application/vnd.github.v3+json'
        };

        const now = Math.floor(Date.now() / 1000);
        const expiration = now + 10 * 60;

        const payload: Record<string, string | number> = {
            iat: now,
            exp: expiration,
            iss: (config?.custom ? config.custom['app_id'] : config.oauth_client_id) as string
        };

        const { success, error, response: rawCredentials } = await this.getJWTCredentials(privateKey, tokenUrl, payload, headers, { algorithm: 'RS256' });

        if (!success || !rawCredentials) {
            return { success, error, response: null };
        }

        const credentials: AppCredentials = {
            type: 'APP',
            access_token: rawCredentials?.token,
            expires_at: rawCredentials?.expires_at,
            raw: rawCredentials as unknown as Record<string, unknown>
        };

        return { success: true, error: null, response: credentials };
    }

    public async getOauthClientCredentials(
        template: ProviderTemplateOAuth2,
        client_id: string,
        client_secret: string,
        connectionConfig: Record<string, string>
    ): Promise<ServiceResponse<OAuth2ClientCredentials>> {
        const strippedTokenUrl = typeof template.token_url === 'string' ? template.token_url.replace(/connectionConfig\./g, '') : '';
        const url = new URL(interpolateString(strippedTokenUrl, connectionConfig));

        let tokenParams = template.token_params && Object.keys(template.token_params).length > 0 ? new URLSearchParams(template.token_params).toString() : '';

        if (connectionConfig['oauth_scopes']) {
            const scope = connectionConfig['oauth_scopes'].split(',').join(template.scope_separator || ' ');
            tokenParams += (tokenParams ? '&' : '') + `scope=${encodeURIComponent(scope)}`;
        }

        const headers: Record<string, string> = {};
        const params = new URLSearchParams();

        const bodyFormat = template.body_format || 'form';
        headers['Content-Type'] = bodyFormat === 'json' ? 'application/json' : 'application/x-www-form-urlencoded';

        if (template.token_request_auth_method === 'basic') {
            headers['Authorization'] = 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64');
        } else if (template.token_request_auth_method === 'custom') {
            params.append('username', client_id);
            params.append('password', client_secret);
        } else {
            params.append('client_id', client_id);
            params.append('client_secret', client_secret);
        }

        if (tokenParams) {
            const tokenParamsEntries = new URLSearchParams(tokenParams).entries();
            for (const [key, value] of tokenParamsEntries) {
                params.append(key, value);
            }
        }
        try {
            const requestOptions = { headers };

            const response = await axios.post(
                url.toString(),
                bodyFormat === 'json' ? JSON.stringify(Object.fromEntries(params.entries())) : params.toString(),
                requestOptions
            );

            const { data } = response;

            if (response.status !== 200) {
                return { success: false, error: new NangoError('invalid_client_credentials'), response: null };
            }

            const parsedCreds = this.parseRawCredentials(data, 'OAUTH2_CC') as OAuth2ClientCredentials;

            parsedCreds.client_id = client_id;
            parsedCreds.client_secret = client_secret;

            return { success: true, error: null, response: parsedCreds };
        } catch (e: any) {
            const errorPayload = {
                message: e.message || 'Unknown error',
                name: e.name || 'Error'
            };
            logger.error(`Error fetching client credentials ${stringifyError(e)}`);
            const error = new NangoError('client_credentials_fetch_error', errorPayload);
            return { success: false, error, response: null };
        }
    }

    public async getTableauCredentials(
        template: Template,
        patName: string,
        patSecret: string,
        connectionConfig: Record<string, string>,
        contentUrl?: string
    ): Promise<ServiceResponse<TableauCredentials>> {
        const strippedTokenUrl = typeof template.token_url === 'string' ? template.token_url.replace(/connectionConfig\./g, '') : '';
        const url = new URL(interpolateString(strippedTokenUrl, connectionConfig)).toString();
        const postBody = {
            credentials: {
                personalAccessTokenName: patName,
                personalAccessTokenSecret: patSecret,
                site: {
                    contentUrl: contentUrl ?? ''
                }
            }
        };

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        };

        const requestOptions = { headers };

        try {
            const response = await axios.post(url, postBody, requestOptions);

            if (response.status !== 200) {
                return { success: false, error: new NangoError('invalid_tableau_credentials'), response: null };
            }

            const { data } = response;

            const parsedCreds = this.parseRawCredentials(data, 'TABLEAU') as TableauCredentials;
            parsedCreds.pat_name = patName;
            parsedCreds.pat_secret = patSecret;
            parsedCreds.content_url = contentUrl ?? '';

            return { success: true, error: null, response: parsedCreds };
        } catch (e: any) {
            const errorPayload = {
                message: e.message || 'Unknown error',
                name: e.name || 'Error'
            };
            logger.error(`Error fetching Tableau credentials tokens ${stringifyError(e)}`);
            const error = new NangoError('tableau_tokens_fetch_error', errorPayload);

            return { success: false, error, response: null };
        }
    }

    public async shouldCapUsage({
        providerConfigKey,
        environmentId,
        type
    }: {
        providerConfigKey: string;
        environmentId: number;
        type: 'activate' | 'deploy';
    }): Promise<boolean> {
        const connections = await this.getConnectionsByEnvironmentAndConfig(environmentId, providerConfigKey);

        if (!connections) {
            return false;
        }

        if (connections.length > CONNECTIONS_WITH_SCRIPTS_CAP_LIMIT) {
            logger.info(`Reached cap for providerConfigKey: ${providerConfigKey} and environmentId: ${environmentId}`);
            if (type === 'deploy') {
                void analytics.trackByEnvironmentId(AnalyticsTypes.RESOURCE_CAPPED_SCRIPT_DEPLOY_IS_DISABLED, environmentId);
            } else {
                void analytics.trackByEnvironmentId(AnalyticsTypes.RESOURCE_CAPPED_SCRIPT_ACTIVATE, environmentId);
            }
            return true;
        }

        return false;
    }

    private async getJWTCredentials(
        privateKey: string,
        url: string,
        payload: Record<string, string | number>,
        additionalApiHeaders: Record<string, string> | null,
        options: object
    ): Promise<ServiceResponse> {
        const hasLineBreak = /^-----BEGIN RSA PRIVATE KEY-----\n/.test(privateKey);

        if (!hasLineBreak) {
            privateKey = privateKey.replace('-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----\n');
            privateKey = privateKey.replace('-----END RSA PRIVATE KEY-----', '\n-----END RSA PRIVATE KEY-----');
        }

        try {
            const token = jwt.sign(payload, privateKey, options);

            const headers = {
                Authorization: `Bearer ${token}`
            };

            if (additionalApiHeaders) {
                Object.assign(headers, additionalApiHeaders);
            }

            const tokenResponse = await axios.post(
                url,
                {},
                {
                    headers
                }
            );

            return { success: true, error: null, response: tokenResponse.data };
        } catch (err) {
            const error = new NangoError('refresh_token_external_error', { message: err instanceof Error ? err.message : 'unknown error' });
            return { success: false, error, response: null };
        }
    }

    private async shouldRefreshCredentials(
        connection: Connection,
        credentials: OAuth2Credentials,
        providerConfig: ProviderConfig,
        template: ProviderTemplateOAuth2,
        instantRefresh: boolean
    ): Promise<boolean> {
        const refreshCondition =
            instantRefresh ||
            (providerClient.shouldIntrospectToken(providerConfig.provider) && (await providerClient.introspectedTokenExpired(providerConfig, connection)));

        let tokenExpirationCondition =
            refreshCondition || (credentials.expires_at && isTokenExpired(credentials.expires_at, template.token_expiration_buffer || 15 * 60));

        if ((template.auth_mode === 'OAUTH2' || credentials?.type === 'OAUTH2') && providerConfig.provider !== 'facebook') {
            tokenExpirationCondition = Boolean(credentials.refresh_token && tokenExpirationCondition);
        }

        return Boolean(tokenExpirationCondition);
    }

    private async getNewCredentials(
        connection: Connection,
        providerConfig: ProviderConfig,
        template: ProviderTemplate
    ): Promise<ServiceResponse<OAuth2Credentials | OAuth2ClientCredentials | AppCredentials | AppStoreCredentials | TableauCredentials>> {
        if (providerClient.shouldUseProviderClient(providerConfig.provider)) {
            const rawCreds = await providerClient.refreshToken(template as ProviderTemplateOAuth2, providerConfig, connection);
            const parsedCreds = this.parseRawCredentials(rawCreds, 'OAUTH2') as OAuth2Credentials;

            return { success: true, error: null, response: parsedCreds };
        } else if (template.auth_mode === 'OAUTH2_CC') {
            const { client_id, client_secret } = connection.credentials as OAuth2ClientCredentials;
            const {
                success,
                error,
                response: credentials
            } = await this.getOauthClientCredentials(template as ProviderTemplateOAuth2, client_id, client_secret, connection.connection_config);

            if (!success || !credentials) {
                return { success, error, response: null };
            }

            return { success: true, error: null, response: credentials };
        } else if (template.auth_mode === 'APP_STORE') {
            const { private_key } = connection.credentials as AppStoreCredentials;
            const { success, error, response: credentials } = await this.getAppStoreCredentials(template, connection.connection_config, private_key);

            if (!success || !credentials) {
                return { success, error, response: null };
            }

            return { success: true, error: null, response: credentials };
        } else if (template.auth_mode === 'APP' || (template.auth_mode === 'CUSTOM' && connection?.credentials?.type !== 'OAUTH2')) {
            const { success, error, response: credentials } = await this.getAppCredentials(template, providerConfig, connection.connection_config);

            if (!success || !credentials) {
                return { success, error, response: null };
            }

            return { success: true, error: null, response: credentials };
        } else if (template.auth_mode === 'TABLEAU') {
            const { pat_name, pat_secret, content_url } = connection.credentials as TableauCredentials;
            const {
                success,
                error,
                response: credentials
            } = await this.getTableauCredentials(template, pat_name, pat_secret, connection.connection_config, content_url);

            if (!success || !credentials) {
                return { success, error, response: null };
            }

            return { success: true, error: null, response: credentials };
        } else {
            const { success, error, response: creds } = await getFreshOAuth2Credentials(connection, providerConfig, template as ProviderTemplateOAuth2);

            return { success, error, response: success ? (creds as OAuth2Credentials) : null };
        }
    }
}

const locking = await (async () => {
    let store: KVStore;
    const url = getRedisUrl();
    if (url) {
        store = new RedisKVStore(url);
        await (store as RedisKVStore).connect();
    } else {
        store = new InMemoryKVStore();
    }
    return new Locking(store);
})();

export default new ConnectionService(locking);
