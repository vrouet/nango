import { stringifyError } from '@nangohq/utils';

export class NangoError extends Error {
    public readonly status: number = 500;
    public readonly type: string;
    public payload: Record<string, unknown>;
    public override readonly message: string;

    constructor(type: string, payload = {}, status?: number) {
        super();

        this.type = type;
        this.payload = payload;

        if (status) {
            this.status = status;
        }

        switch (type) {
            case 'failed_to_get_sync_client':
                this.status = 500;
                this.message = 'Failed to get the sync client.';
                break;

            case 'missing_auth_header':
                this.status = 401;
                this.message = 'Authentication failed. The request is missing the Authorization header.';
                break;

            case 'malformed_auth_header':
                this.status = 401;
                this.message = 'Authentication failed. The Authorization header is malformed.';
                break;

            case 'unknown_account':
                this.status = 401;
                this.message = 'Authentication failed. The provided secret/public key does not match any account.';
                break;

            case 'invalid_secret_key':
                this.status = 401;
                this.message = 'Authentication failed. The provided secret key is invalid.';
                break;

            case 'invalid_secret_key_format':
                this.status = 401;
                this.message = 'Authentication failed. The provided secret key is not a UUID v4.';
                break;

            case 'missing_public_key':
                this.status = 401;
                this.message = 'Authentication failed. The request is missing a valid public key parameter.';
                break;

            case 'invalid_public_key':
                this.status = 401;
                this.message = 'Authentication failed. The provided public key is not a UUID v4.';
                break;

            case 'only_nango_cloud':
                this.status = 401;
                this.message = 'This endpoint is only available for Nango Cloud.';
                break;

            case 'invalid_admin_key':
                this.status = 401;
                this.message = 'Authentication failed. The provided admin key is invalid.';
                break;

            case 'admin_key_configuration':
                this.status = 401;
                this.message = 'The admin key is not configured on the server. Contact the API provider.';
                break;

            case 'user_not_found':
                this.status = 401;
                this.message = 'Authentication failed. The user could not be found.';
                break;

            case 'missing_body':
                this.status = 400;
                this.message = 'Missing request body.';
                break;

            case 'missing_email_param':
                this.status = 400;
                this.message = `Missing parameter 'email'.`;
                break;

            case 'missing_name_param':
                this.status = 400;
                this.message = `Missing parameter 'name'.`;
                break;

            case 'missing_password_param':
                this.status = 400;
                this.message = `Missing parameter 'password'.`;
                break;

            case 'duplicate_account':
                this.status = 409;
                this.message = 'Email already exists.';
                break;

            case 'unknown_user':
                this.status = 404;
                this.message = 'No user matching this email.';
                break;

            case 'unknown_endpoint':
                this.status = 404;
                this.message = 'The API endpoint could not be found and returned a 404. Please ensure you have the endpoint specified and spelled correctly.';
                break;

            case 'forbidden':
                this.status = 403;
                this.message = 'The API endpoint returned back a 403 error. Check the scopes requested to make sure proper access is requested to the API.';
                break;

            case 'bad_request':
                this.status = 400;
                this.message = 'The API endpoint returned back a 400 error. Check the headers to ensure all proper headers are passed to the API.';
                break;

            case 'invalid_oauth_scopes':
                this.status = 400;
                this.message = 'The requested OAuth scopes are invalid. OAuth scopes should be comma separated and not an array';
                break;

            case 'invalid_env':
                this.status = 400;
                this.message = "Invalid param 'env'";
                break;

            case 'missing_environment_id':
                this.status = 400;
                this.message = `Missing param 'environment_id'.`;
                break;

            case 'invalid_invite_token':
                this.status = 400;
                this.message = 'The invite token is invalid.';
                break;

            case 'missing_api_key':
                this.status = 400;
                this.message = `Missing param 'api_key'.`;
                break;

            case 'missing_private_key':
                this.status = 400;
                this.message = `Missing param 'missing_private_key'.`;
                break;

            case 'missing_private_key_id':
                this.status = 400;
                this.message = `Missing param 'private_key_id'.`;
                break;

            case 'missing_issuer_id':
                this.status = 400;
                this.message = `Missing param 'missing_issuer_id'.`;
                break;

            case 'missing_app_id':
                this.status = 400;
                this.message = `Missing param 'app_id'.`;
                break;

            case 'missing_custom':
                this.status = 400;
                this.message = `Missing param 'custom'.`;
                break;

            case 'missing_installation_id':
                this.status = 400;
                this.message = `Missing param 'installation_id'.`;
                break;

            case 'missing_basic_username':
                this.status = 400;
                this.message = `Missing param username for basic api authentication.`;
                break;

            case 'missing_username_mismatch_template':
                this.status = 400;
                this.message = `Missing param 'username' for the provider template of Basic auth.`;
                break;

            case 'missing_password_mismatch_template':
                this.status = 400;
                this.message = `Missing param 'password' for the provider template of Basic auth.`;
                break;

            case 'missing_api_key_mismatch_template':
                this.status = 400;
                this.message = `Missing param 'api_key' for the provider template of API Key auth.`;
                break;

            case 'missing_basic_password':
                this.status = 400;
                this.message = `Missing param password for basic api authentication.`;
                break;

            case 'missing_access_token':
                this.status = 400;
                this.message = `Missing param 'access_token'.`;
                break;

            case 'missing_expires_at':
                this.status = 400;
                this.message = `Importing an OAuth2 token requires the 'expires_at' parameter. If the token doesn't expire pass in the 'no_expiration' parameter`;
                break;

            case 'invalid_expires_at':
                this.status = 400;
                this.message = `The provided 'expires_at' parameter is invalid. It should be a valid date`;
                break;

            case 'missing_hmac':
                this.status = 400;
                this.message = `Missing param 'hmac'.`;
                break;

            case 'invalid_hmac':
                this.status = 400;
                this.message = `Invalid HMAC signature.`;
                break;

            case 'missing_provider_config':
                this.status = 400;
                this.message = `Missing param 'provider_config_key'.`;
                break;

            case 'missing_callback_url':
                this.status = 400;
                this.message = `Missing param 'callback_url'.`;
                break;

            case 'provider_config_creation_failure':
                this.status = 500;
                this.message = `Failed to create the Provider Configuration. Please try again.`;
                break;

            case 'unknown_provider_config':
                this.status = 400;
                this.message = `There is no Provider Configuration matching this key.`;
                if (this.payload) {
                    this.message += ` Please make sure this value exists in the Nango dashboard ${JSON.stringify(this.payload, null, 2)}`;
                }
                break;

            case 'action_failure':
                this.status = 400;
                this.message = `Failed to perform the action`;
                break;

            case 'webhook_failure':
                this.status = 400;
                this.message = `Failed to perform the webhook`;
                break;

            case 'post_connection_failure':
                this.status = 400;
                this.message = `Failed to perform the post connection script`;
                break;

            case 'missing_provider_template':
                this.status = 400;
                this.message = `Missing param 'provider'.`;
                break;

            case 'no_syncs_found':
                this.status = 400;
                this.message = `No syncs found given the inputs.`;
                break;

            case 'missing_client_id':
                this.status = 400;
                this.message = `Missing param 'oauth_client_id'.`;
                break;

            case 'missing_client_secret':
                this.status = 400;
                this.message = `Missing param 'oauth_client_secret'.`;
                break;

            case 'missing_app_secret':
                this.status = 400;
                this.message = `Missing param 'app_secret'.`;
                break;

            case 'missing_scopes':
                this.status = 400;
                this.message = `Missing param 'oauth_scopes'.`;
                break;

            case 'missing_connection':
                this.status = 400;
                this.message = `Missing param 'connection_id'.`;
                break;

            case 'missing_connection_id':
                this.status = 400;
                this.message = `Missing param 'connection_id'.`;
                break;

            case 'invalid_offset':
                this.status = 400;
                this.message = 'Invalid offset provided. The offset should be a number.';
                break;

            case 'invalid_limit':
                this.status = 400;
                this.message = 'Invalid limit provided. The limit should be a number.';
                break;

            case 'invalid_timestamp':
                this.status = 400;
                this.message = 'Invalid timestamp provided. The timestamp should be an ISO 8601 string, for example 2023-01-01T00:00:00.000Z.';
                break;

            case 'missing_model':
                this.status = 400;
                this.message = `Missing param 'model'.`;
                break;

            case 'unknown_connection':
                this.status = 404;
                this.message = `No connection matching the provided params of 'connection_id' and 'provider_config_key'.`;
                if (this.payload) {
                    this.message += ` Please make sure these values exist in the Nango dashboard ${JSON.stringify(this.payload, null, 2)}`;
                }
                break;

            case 'refresh_token_external_error':
                this.status = 400;
                this.message = `The external API returned an error when trying to refresh the access token. Please try again later.`;
                break;

            case 'request_token_external_error':
                this.status = 400;
                this.message = `The external API returned an error when trying to request for an access token. Please try again later.`;
                if (this.payload) {
                    this.message += ` ${JSON.stringify(this.payload, null, 2)}`;
                }
                break;

            case 'connection_already_exists':
                this.status = 409;
                this.message = 'A connection already exists for this provider configuration.';
                break;

            case 'missing_base_api_url':
                this.status = 400;
                this.message =
                    'The proxy is either not supported for this provider or it does not have a default base URL configured (use the baseUrlOverride config param to specify a base URL).';
                break;

            case 'provider_config_edit_not_allowed':
                this.status = 400;
                this.message = 'Provider configuration cannot be edited for API key based authentication.';
                break;

            case 'connection_test_failed':
                this.status = status || 400;
                this.message = `The given credentials were found to be invalid${status ? ` and received a ${status} on a test API call` : ''}. Please check the credentials and try again.`;
                break;

            case 'invalid_auth_mode':
                this.status = 400;
                this.message = 'Invalid auth mode. The provider does not support this auth mode.';
                break;

            case 'wrong_auth_mode':
                this.status = 400;
                this.message = 'The provider does not support making requests. Please use the github-app-oauth provider for the request flow.';
                break;

            case 'unknown_provider_template':
                this.status = 400;
                this.message = `No Provider Template matching the 'provider' parameter.`;
                break;

            case 'duplicate_provider_config':
                this.status = 409;
                this.message = `There is already a Provider Configuration matching the param 'provider_config_key'.`;
                break;

            case 'missing_password_reset_token':
                this.status = 400;
                this.message = 'Missing reset token (or password).';
                break;

            case 'unknown_password_reset_token':
                this.status = 404;
                this.message = 'Reset password token expired on unknown.';
                break;

            case 'missing_required_fields_on_deploy':
                this.status = 400;
                this.message = 'Sync name, provider config key, the file, the models, and the runs fields are required to deploy a sync';
                break;

            case 'file_upload_error':
                this.status = 500;
                this.message = 'Error uploading file. Please contact support with the filename and connection details';
                break;

            case 'empty_insert_data_on_deploy':
                this.status = 400;
                this.message = 'The data to insert for a deploy is empty. Please try again or reach out to support with the sync name and connection details';
                break;

            case 'error_creating_sync_config':
                this.status = 500;
                this.message = 'Error creating sync config from a deploy. Please contact support with the sync name and connection details';
                break;

            case 'generic_error_support':
                this.status = 500;
                this.message = 'An error occurred. Please contact support with this unique id: ' + this.payload;
                break;

            case 'missing_id_field':
                this.status = 400;
                this.message = `Missing id field in the "${this.payload}" model. Make sure every single element in the array has an id property.`;
                break;

            case 'sync_interval_too_short':
                this.status = 400;
                this.message = 'Sync interval is too short. The minimum interval is 5 minutes.';
                break;

            case 'provider_not_on_account':
                this.status = 400;
                this.message = 'This provider is not on your account. Please add the provider to your account first via the integrations tab.';
                break;

            case 'integration_file_not_found':
                this.status = 404;
                this.message = 'The integration file was not found. Please make sure you have recently deployed the integration file(s).';
                break;

            case 'error_creating_zip_file':
                this.status = 500;
                this.message = 'Error creating a zip of the integration file(s). Make sure you have recently deployed the integration file(s).';
                break;

            case 'sync_interval_invalid':
                this.status = 400;
                this.message = 'Sync interval is invalid. The interval should be a time unit.';
                break;

            case 'sync_script_failure':
                this.message = `The sync script failed with an error: ${this.payload}`;
                break;

            case 'error_loading_nango_config':
                this.status = 400;
                this.message = `Error loading nango config. Please make sure it is present and formatted correctly.${
                    this.payload ? ` Error: ${JSON.stringify(this.payload, null, 2)}` : ''
                }`;
                break;

            case 'endpoint_output_mismatch':
                this.status = 400;
                this.message = `The number of endpoints doesn't match the number of models returned from the output for ${this.payload}. The endpoints to model should match 1 to 1.`;
                break;

            case 'action_single_endpoint':
                this.status = 400;
                this.message = `Actions are only allowed to have one model to be returned and only allow a single endpoint`;
                break;

            case 'duplicate_endpoint':
                this.status = 400;
                this.message = `Duplicate endpoint "${this.payload}" found. Please make sure all endpoints are unique within an integration.`;
                break;

            case 'duplicate_model':
                this.status = 400;
                this.message = `Duplicate model "${this.payload['model']}" for the ${this.payload['type']} "${this.payload['name']}" found. Please make sure all models are unique within an integration.`;
                break;

            case 'invalid_app_secret':
                this.status = 400;
                this.message = `Invalid app secret key. Please make sure the app secret is correct.`;
                break;

            case 'no_config_found':
                this.status = 400;
                this.message = 'No nango config found. Please make sure it is present and formatted correctly.';
                break;

            case 'conflicting_model_and_input':
                this.status = 400;
                this.message = 'Cannot have a model in the endpoint and in the input';
                break;

            case 'invalid_model_identifier':
                this.status = 400;
                this.message =
                    'Invalid model identifier. Please make sure to include a model identifier in the endpoint or in the input by using a colon (:) to separate the model name and the model identifier.';
                break;

            case 'missing_model_identifier':
                this.status = 400;
                this.message = `The model identifier was not found in the model. Please make sure the field "${this.payload}" is included in the model.`;
                break;

            case 'missing_model_name':
                this.status = 400;
                this.message = `Model ${this.payload} not found included in models definition`;
                break;

            case 'action_script_failure':
                this.message = `The action script failed with an error: ${this.payload}`;
                break;

            case 'webhook_script_failure':
                this.message = `The webhook script failed with an error: ${this.payload}`;
                break;

            case 'post_connection_script_failure':
                this.message = `The post-connection script failed with an error: ${this.payload}`;
                break;

            case 'pass_through_error':
                this.status = 400;
                this.message = `${this.payload}`;
                break;

            case 'action_script_runtime_error':
                this.status = 500;
                this.message = '';
                break;

            case 'script_cancelled':
                this.message = 'The script was cancelled';
                break;

            case 'run_id_not_found':
                this.status = 400;
                this.message = 'The run id was not found';
                break;

            case 'sync_job_not_running':
                this.status = 400;
                this.message = 'The sync is not currently running so cannot be cancelled';
                break;

            case 'incorrect_param':
                this.status = 400;
                this.message = `The parameter ${this.payload['incorrect']} is invalid. Did you mean ${this.payload['correct']}?`;
                break;

            case 'invalid_provider':
                this.status = 400;
                this.message = `The provider is not allowed. Please try again with a valid provider`;
                break;

            case 'workos_not_configured':
                this.status = 400;
                this.message = `WorkOS is not configured. Please reach out to support to obtain valid WorkOS credentials.`;
                break;

            case 'missing_managed_login_callback_code':
                this.status = 400;
                this.message = `Missing param 'code' for the managed login callback.`;
                break;

            case 'missing_name_for_account_creation':
                this.status = 400;
                this.message = `Missing an account name for account login/signup.`;
                break;

            case 'account_not_found':
                this.status = 404;
                this.message = `Missing an account name for account login/signup.`;
                break;

            case 'resource_capped':
                this.status = 400;
                // TODO docs link
                this.message =
                    'You have reached the maximum number of integrations with active scripts. Upgrade or deactivate the scripts to create more connections (https://docs.nango.dev/reference/limits).';
                break;

            case 'failed_to_parse_nango_yaml':
                this.status = 400;
                this.message = `Your nango.yaml contains some errors`;
                break;

            case 'deploy_missing_json_schema_model':
                this.status = 400;
                this.message = String(this.payload);
                break;

            case 'invalid_action_input':
                this.status = 400;
                this.message = 'Failed to validate the input passed to the action';
                break;

            case 'invalid_action_output':
                this.status = 400;
                this.message = 'Failed to validate the output passed to the action';
                break;

            case 'invalid_sync_record':
                this.status = 400;
                this.message = 'Failed to validate a record in batchSave';
                break;

            case 'script_output_too_big':
                this.status = 400;
                this.message = 'Script output is too big';
                break;

            case 'sync_job_update_failure':
                this.status = 500;
                this.message = `The sync job results could not be updated: ${this.payload}`;
                break;

            default:
                this.status = 500;
                this.type = 'unhandled_' + type;
                this.message = `An unhandled error of type '${type}' with payload '${JSON.stringify(this.payload)}' has occurred`;
        }
    }

    public setPayload(payload: any) {
        this.payload = payload;
    }
}

export const formatScriptError = (err: any, errorType: string, scriptName: string) => {
    let errorMessage: string;

    if ('response' in err && 'data' in err.response) {
        if (typeof err.response.data === 'string' && (err.response.data.trim().startsWith('<!DOCTYPE html>') || /<\/?[a-z][\s\S]*>/i.test(err.response.data))) {
            errorMessage = err.response.data;
        } else {
            errorMessage = JSON.stringify(err.response.data, null, 2);
        }
    } else if (err.message) {
        errorMessage = err.message;
    } else if (typeof err === 'object' && Object.keys(err as object).length > 0) {
        errorMessage = stringifyError(err, { pretty: true, stack: true });
    } else {
        errorMessage = String(err);
    }

    const content = `Script for '${scriptName}' failed to execute with error: ${errorMessage}`;

    const status = err?.response?.status || 500;
    const error = new NangoError(errorType, content, status);

    return { success: false, error, response: null };
};

export function isNangoErrorAsJson(obj: unknown): obj is NangoError {
    return Boolean(typeof obj === 'object' && obj && 'payload' in obj && 'type' in obj);
}

export function deserializeNangoError(err: unknown): NangoError | null {
    if (isNangoErrorAsJson(err)) {
        return new NangoError(err['type'], err.payload, err.status);
    }
    return null;
}
