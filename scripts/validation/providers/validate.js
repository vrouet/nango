import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import jsYaml from 'js-yaml';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log('Validate');
const pathSchema = path.join(__dirname, 'schema.json');
const pathProviders = path.join(__dirname, '../../../packages/shared/providers.yaml');

// Schema
const ajv = new Ajv({ allErrors: true, discriminator: true });
const schemaJson = fs.readFileSync(pathSchema);
const validator = ajv.compile(JSON.parse(schemaJson.toString()));
console.log('loaded schema.json', pathSchema);

// Providers
const providersYaml = fs.readFileSync(pathProviders);
console.log('loaded providers.yaml', pathProviders, providersYaml.toString().length);
const providersJson = jsYaml.load(providersYaml.toString());
console.log('parsed providers', Object.keys(providersJson));

// Validation
console.log('validating');
if (validator(providersJson)) {
    console.log('✅ done');
    process.exit(0);
}

console.error('error', validator.errors);

process.exit(1);
