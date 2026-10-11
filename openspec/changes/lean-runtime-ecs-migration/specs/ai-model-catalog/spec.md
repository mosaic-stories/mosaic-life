## MODIFIED Requirements

### Requirement: Alias-Based Bedrock Model Catalog
Every deployment SHALL expose a configured catalog of Bedrock-backed model aliases that core-api and other internal clients invoke by alias rather than by raw Bedrock model ID. The catalog SHALL be served by one of two resolvers, depending on how the environment is deployed:

- the **LiteLLM proxy** (`model_name` entries in its `model_list`), when the proxy is deployed (EKS runtime, or local dev with the LiteLLM compose service);
- **core-api's built-in Bedrock alias catalog**, when core-api calls Bedrock directly (`AI_LLM_PROVIDER=bedrock` / `AI_EMBEDDING_PROVIDER=bedrock`, the lean ECS runtime).

Both catalogs SHALL define the same alias names, and they SHALL be kept in sync in the same change whenever an alias is added, removed or repointed. Aliases SHALL point to the same underlying Bedrock model in both, using the applicable ID form: a cross-region inference profile where one exists, otherwise the in-region model ID.

#### Scenario: Adding a model requires only configuration
- **WHEN** a new Bedrock model alias (for example `claude-sonnet-5`, `claude-opus-5` or `glm-5`) is added to both the LiteLLM `model_list` configuration and core-api's Bedrock alias catalog
- **THEN** core-api can request completions using that alias name in either runtime mode with no change to core-api's calling code, and no IAM policy change is required as long as the underlying Bedrock model is within the already-granted `foundation-model` / `inference-profile` permissions

#### Scenario: Catalog is discoverable via the proxy's model listing
- **WHEN** the LiteLLM proxy is deployed and a client calls its `/v1/models` endpoint
- **THEN** the response includes every alias currently defined in that environment's `model_list`, including any newly added aliases, without requiring a proxy restart beyond the config-change rollout the deployment already performs

#### Scenario: Environment catalogs stay in sync
- **WHEN** an alias is added to the production/staging `model_list`
- **THEN** the same alias is also present in the local-dev `model_list` and in core-api's Bedrock alias catalog, using that environment's applicable Bedrock ID form (cross-region inference profile in production, direct account ID in local dev, or an identical ID in both when no cross-region profile exists for that model)

#### Scenario: Direct-Bedrock mode resolves aliases
- **WHEN** core-api runs with `AI_LLM_PROVIDER=bedrock` and a feature requests completions with the alias `claude-sonnet-4-6`
- **THEN** the request reaches Bedrock using the model ID `claude-sonnet-4-6` maps to in the catalog, and the response streams normally

#### Scenario: Unknown or empty model ID falls back to the default
- **WHEN** core-api in direct-Bedrock mode receives an empty model ID, or one that is neither a catalog alias nor a raw Bedrock ID
- **THEN** an empty model ID resolves to the alias in `DEFAULT_CHAT_MODEL_ID`, and an unrecognised ID is passed to Bedrock unchanged so Bedrock's own error surfaces (logged with the requested ID)

#### Scenario: Embeddings remain compatible after switching resolver
- **WHEN** core-api switches from LiteLLM to direct-Bedrock embeddings
- **THEN** new embeddings are produced by Titan Text Embeddings v2 at 1024 dimensions, the same model and dimension as the vectors already stored, so similarity search over existing vectors keeps working without re-embedding
