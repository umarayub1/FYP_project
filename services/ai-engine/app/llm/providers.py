from app.config import settings


def get_llm(
    provider: str | None = None,
    model: str | None = None,
    *,
    temperature: float | None = None,
):
    """Return a LangChain chat model. Falls back to env defaults if not specified.

    `temperature` is optional — pass 0.0 for paths that require reproducible
    outputs (e.g. the Feynman accuracy rubric's per-concept judge). When
    None, each provider's library default is used.
    """
    effective_provider = provider or settings.llm_provider
    effective_model = model or settings.llm_model
    temp_kwargs: dict = {} if temperature is None else {'temperature': temperature}

    if effective_provider == 'local':
        from langchain_community.chat_models import ChatOllama
        return ChatOllama(
            model=effective_model or settings.ollama_model,
            base_url=settings.ollama_base_url,
            **temp_kwargs,
        )
    elif effective_provider == 'anthropic' or (provider is None and settings.anthropic_api_key):
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=effective_model,
            api_key=settings.anthropic_api_key,
            streaming=True,
            **temp_kwargs,
        )
    else:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=effective_model,
            api_key=settings.openai_api_key,
            streaming=True,
            **temp_kwargs,
        )
