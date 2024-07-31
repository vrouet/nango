import type { JsonValue, SetOptional } from 'type-fest';
import type { PostImmediate } from '../routes/v1/postImmediate.js';
import type { PostRecurring } from '../routes/v1/postRecurring.js';
import type { Result } from '@nangohq/utils';
import type { ScheduleState, TaskState } from '@nangohq/scheduler';
import type { PostScheduleRun } from '../routes/v1/schedules/postRun.js';

export type ImmediateProps = PostImmediate['Body'];
export type RecurringProps = PostRecurring['Body'];

interface SyncArgs {
    syncId: string;
    syncName: string;
    debug: boolean;
    connection: {
        id: number;
        provider_config_key: string;
        environment_id: number;
        connection_id: string;
    };
}
interface AbortArgs {
    abortedTask: {
        id: string;
        state: TaskState;
    };
    reason: string;
}
interface ActionArgs {
    actionName: string;
    connection: {
        id: number;
        provider_config_key: string;
        environment_id: number;
        connection_id: string;
    };
    activityLogId: string;
    input: JsonValue;
}
interface WebhookArgs {
    webhookName: string;
    parentSyncName: string;
    connection: {
        id: number;
        connection_id: string;
        provider_config_key: string;
        environment_id: number;
    };
    activityLogId: string;
    input: JsonValue;
}

interface PostConnectionArgs {
    postConnectionName: string;
    connection: {
        id: number;
        connection_id: string;
        provider_config_key: string;
        environment_id: number;
    };
    version: string;
    fileLocation: string;
    activityLogId: string;
}
export type SchedulesReturn = Result<OrchestratorSchedule[]>;
export type VoidReturn = Result<void, ClientError>;
export type ExecuteProps = SetOptional<ImmediateProps, 'retry' | 'timeoutSettingsInSecs'>;
export type ExecuteReturn = Result<JsonValue, ClientError>;
export type ExecuteActionProps = Omit<ExecuteProps, 'args'> & { args: ActionArgs };
export type ExecuteWebhookProps = Omit<ExecuteProps, 'args'> & { args: WebhookArgs };
export type ExecutePostConnectionProps = Omit<ExecuteProps, 'args'> & { args: PostConnectionArgs };
export type ExecuteSyncProps = PostScheduleRun['Body'];

export interface OrchestratorSchedule {
    id: string;
    name: string;
    frequencyMs: number;
    state: ScheduleState;
    nextDueDate: Date | null;
}

export type OrchestratorTask = TaskSync | TaskSyncAbort | TaskAction | TaskWebhook | TaskPostConnection;

interface TaskCommonFields {
    id: string;
    name: string;
    groupKey: string;
    state: TaskState;
    attempt: number;
}
interface TaskCommon extends TaskCommonFields {
    isSync(this: OrchestratorTask): this is TaskSync;
    isWebhook(this: OrchestratorTask): this is TaskWebhook;
    isAction(this: OrchestratorTask): this is TaskAction;
    isPostConnection(this: OrchestratorTask): this is TaskPostConnection;
    isSyncAbort(this: OrchestratorTask): this is TaskSyncAbort;
}

export interface TaskSync extends TaskCommon, SyncArgs {}
export function TaskSync(props: TaskCommonFields & SyncArgs): TaskSync {
    return {
        id: props.id,
        name: props.name,
        state: props.state,
        attempt: props.attempt,
        syncId: props.syncId,
        syncName: props.syncName,
        debug: props.debug,
        connection: props.connection,
        groupKey: props.groupKey,
        isSync: () => true,
        isWebhook: () => false,
        isAction: () => false,
        isPostConnection: () => false,
        isSyncAbort: () => false
    };
}

export interface TaskSyncAbort extends TaskCommon, SyncArgs, AbortArgs {}
export function TaskSyncAbort(props: TaskCommonFields & SyncArgs & AbortArgs): TaskSyncAbort {
    return {
        id: props.id,
        abortedTask: props.abortedTask,
        name: props.name,
        state: props.state,
        attempt: props.attempt,
        syncId: props.syncId,
        syncName: props.syncName,
        debug: props.debug,
        connection: props.connection,
        groupKey: props.groupKey,
        reason: props.reason,
        isSync: () => false,
        isWebhook: () => false,
        isAction: () => false,
        isPostConnection: () => false,
        isSyncAbort: () => true
    };
}

export interface TaskAction extends TaskCommon, ActionArgs {}
export function TaskAction(props: TaskCommonFields & ActionArgs): TaskAction {
    return {
        id: props.id,
        name: props.name,
        state: props.state,
        attempt: props.attempt,
        actionName: props.actionName,
        connection: props.connection,
        activityLogId: props.activityLogId,
        input: props.input,
        groupKey: props.groupKey,
        isSync: () => false,
        isWebhook: () => false,
        isAction: () => true,
        isPostConnection: () => false,
        isSyncAbort: () => false
    };
}

export interface TaskWebhook extends TaskCommon, WebhookArgs {}
export function TaskWebhook(props: TaskCommonFields & WebhookArgs): TaskWebhook {
    return {
        id: props.id,
        name: props.name,
        state: props.state,
        attempt: props.attempt,
        webhookName: props.webhookName,
        parentSyncName: props.parentSyncName,
        connection: props.connection,
        activityLogId: props.activityLogId,
        input: props.input,
        groupKey: props.groupKey,
        isSync: () => false,
        isWebhook: () => true,
        isAction: () => false,
        isPostConnection: () => false,
        isSyncAbort: () => false
    };
}

export interface TaskPostConnection extends TaskCommon, PostConnectionArgs {}
export function TaskPostConnection(props: TaskCommonFields & PostConnectionArgs): TaskPostConnection {
    return {
        id: props.id,
        state: props.state,
        name: props.name,
        attempt: props.attempt,
        postConnectionName: props.postConnectionName,
        version: props.version,
        connection: props.connection,
        fileLocation: props.fileLocation,
        activityLogId: props.activityLogId,
        groupKey: props.groupKey,
        isSync: () => false,
        isWebhook: () => false,
        isAction: () => false,
        isPostConnection: () => true,
        isSyncAbort: () => false
    };
}

export interface ClientError extends Error {
    name: string;
    payload: JsonValue;
}
