"""Model catalogue and launch command for the GitHub Copilot CLI, the single agent provider."""
import os
from pathlib import Path
import shutil

WORKER = 'copilot'

# (model id, display name, family). IDs are the values accepted by `copilot --model`.
CATALOGUE = (
    ('claude-opus-5.5', 'Claude Opus 5.5', 'Claude'),
    ('claude-opus-5', 'Claude Opus 5', 'Claude'),
    ('claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Claude'),
    ('claude-sonnet-5', 'Claude Sonnet 5', 'Claude'),
    ('claude-haiku-5.5', 'Claude Haiku 5.5', 'Claude'),
    ('claude-haiku-4.5', 'Claude Haiku 4.5', 'Claude'),
    ('gpt-6.1-sol', 'GPT 6.1 Sol', 'GPT'),
    ('gpt-6.1-terra', 'GPT 6.1 Terra', 'GPT'),
    ('gpt-6-sol', 'GPT 6 Sol', 'GPT'),
    ('gpt-6-luna', 'GPT 6 Luna', 'GPT'),
    ('gpt-6-astra', 'GPT 6 Astra', 'GPT'),
    ('gpt-5.6-sol', 'GPT 5.6 Sol', 'GPT'),
    ('gpt-5.6-terra', 'GPT 5.6 Terra', 'GPT'),
    ('gpt-5.6-luna', 'GPT 5.6 Luna', 'GPT'),
    ('gpt-5.3-codex', 'GPT 5.3 Codex', 'GPT'),
    ('gemini-4-argon', 'Gemini 4 Argon', 'Gemini'),
    ('gemini-4-carbon', 'Gemini 4 Carbon', 'Gemini'),
    ('gemini-3.8-flash', 'Gemini 3.8 Flash', 'Gemini'),
    ('grok-4.7', 'Grok 4.7', 'Grok'),
    ('grok-4.6', 'Grok 4.6', 'Grok'),
    ('kimi-k3', 'Kimi K3', 'Kimi'),
    ('mai-code-1.1-flash', 'MAI Code 1.1 Flash', 'MAI'),
)
MODELS = tuple(item[0] for item in CATALOGUE)

PLANNER_MODEL = 'claude-opus-5.5'
REVIEWER_MODEL = 'gpt-6.1-sol'
# One strong model per family answers group messages, so a group send never fans out to all models.
TEAM_PANEL = ('claude-opus-5.5', 'gpt-6.1-sol', 'gemini-4-argon', 'grok-4.7', 'kimi-k3', 'claude-sonnet-5.5')

PROFILES = {'cp-' + model: (name, model) for model, name, _ in CATALOGUE}
FAMILIES = {'cp-' + model: family for model, _, family in CATALOGUE}
ROOMS = {'team'} | set(PROFILES)

# The model sees no tools: agents here draft and review text only.
EXCLUDED_TOOLS = ('bash,view,edit,create,grep,glob,read_bash,stop_bash,list_bash,web_fetch,task,skill,sql,'
                  'fetch_copilot_cli_documentation,semantic_code_search,run_dynamic_workflow,'
                  'dynamic_workflows_manage,session_store_sql,read_agent,list_agents,write_agent,ask_user,'
                  'lexical_code_search')
MAX_PROMPT_BYTES = 200_000


def room_for_model(model):
    return 'cp-' + model if model in MODELS else 'cp-auto'


def selected_model(worker, model):
    if worker != WORKER:
        raise ValueError('Unsupported worker; Copilot is the only connected provider')
    if model in (None, '', 'default', 'auto'):
        return None
    if model not in MODELS:
        raise ValueError('Unknown Copilot model selection')
    return model


def binary():
    return shutil.which('copilot') or '/opt/homebrew/bin/copilot'


def command(prompt, model=None):
    """Argument list for one bounded, tool-less Copilot CLI call."""
    if len(prompt.encode()) > MAX_PROMPT_BYTES:
        raise ValueError('Prompt exceeds the size the CLI can accept; shorten the brief or context')
    args = [binary(), '-p', prompt, '-s', '--no-color', '--no-ask-user', '--no-auto-update',
            '--no-custom-instructions', '--disable-builtin-mcps',
            '--excluded-tools=' + EXCLUDED_TOOLS,
            '--deny-tool=shell', '--deny-tool=write', '--deny-tool=url']
    if model:
        args += ['--model', model]
    credits = os.environ.get('CADF_MAX_AI_CREDITS', '')
    if credits.replace('.', '', 1).isdigit():
        args += ['--max-ai-credits', credits]
    return args


def environment():
    env = os.environ.copy()
    for key in ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'XAI_API_KEY',
                'OPENAI_BASE_URL', 'GOOGLE_APPLICATION_CREDENTIALS']:
        env.pop(key, None)  # subscription sign-in only; never pay-per-call API keys
    return env


def installed():
    return Path(binary()).exists()
