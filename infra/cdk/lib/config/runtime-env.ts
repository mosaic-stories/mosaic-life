import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';

/** Reference to one JSON key of a Secrets Manager secret. */
export interface SecretRef {
  secret: string;
  key: string;
}

export interface RuntimeEnvConfig {
  environment: string;
  coreApi: { env: Record<string, string> };
  web: { env: Record<string, string> };
  /** core-api secrets: env var name -> Secrets Manager secret + JSON key. */
  secrets: Record<string, SecretRef>;
}

const REQUIRED_CORE_API_ENV = [
  'ENV',
  'APP_URL',
  'API_URL',
  'S3_MEDIA_BUCKET',
  'S3_BACKUP_BUCKET',
  'AI_LLM_PROVIDER',
  'AI_EMBEDDING_PROVIDER',
  'GRAPH_AUGMENTATION_ENABLED',
  'RUN_MIGRATIONS_ON_START',
];
const REQUIRED_WEB_ENV = ['NGINX_RESOLVER', 'CORE_API_UPSTREAM', 'PRERENDER_HOST'];
const REQUIRED_SECRETS = ['DB_URL', 'SESSION_SECRET_KEY', 'INTERNAL_API_TOKEN'];
const FORBIDDEN_PREFIXES = ['LITELLM_', 'NEPTUNE_'];

const CONFIG_DIR = path.resolve(__dirname, '../../../config/runtime-env');

function fail(file: string, msg: string): never {
  throw new Error(`runtime-env ${file}: ${msg}`);
}

function stringMap(file: string, label: string, value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(file, `${label} must be a map`);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v !== 'string') fail(file, `${label}.${k} must be a string (quote numbers and booleans)`);
    out[k] = v as string;
  }
  return out;
}

/** Load and validate `infra/config/runtime-env/{environment}.yaml`. Throws on missing required keys. */
export function loadRuntimeEnv(environment: string, dir: string = CONFIG_DIR): RuntimeEnvConfig {
  const file = `${environment}.yaml`;
  const raw = parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Record<string, any> | null;
  if (!raw || typeof raw !== 'object') fail(file, 'empty or not a map');
  if (raw.environment !== environment) fail(file, `environment must be "${environment}"`);

  const coreEnv = stringMap(file, 'coreApi.env', raw.coreApi?.env);
  const webEnv = stringMap(file, 'web.env', raw.web?.env);
  const secrets: Record<string, SecretRef> = {};
  for (const [name, ref] of Object.entries((raw.secrets ?? {}) as Record<string, any>)) {
    if (typeof ref?.secret !== 'string' || typeof ref?.key !== 'string') fail(file, `secrets.${name} needs secret and key`);
    secrets[name] = { secret: ref.secret, key: ref.key };
  }

  for (const k of REQUIRED_CORE_API_ENV) if (!(k in coreEnv)) fail(file, `missing coreApi.env.${k}`);
  for (const k of REQUIRED_WEB_ENV) if (!(k in webEnv)) fail(file, `missing web.env.${k}`);
  for (const k of REQUIRED_SECRETS) if (!(k in secrets)) fail(file, `missing secrets.${k}`);
  for (const k of [...Object.keys(coreEnv), ...Object.keys(secrets)]) {
    if (FORBIDDEN_PREFIXES.some((p) => k.startsWith(p))) fail(file, `${k} must not be set in the lean runtime`);
  }
  for (const k of Object.keys(coreEnv)) if (k in secrets) fail(file, `${k} is both a plain env var and a secret`);

  return { environment, coreApi: { env: coreEnv }, web: { env: webEnv }, secrets };
}
