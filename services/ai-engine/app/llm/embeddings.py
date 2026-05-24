from app.config import settings


def get_embedding_model():
    if settings.embedding_provider == 'openai':
        from llama_index.embeddings.openai import OpenAIEmbedding
        return OpenAIEmbedding(model=settings.embedding_model, api_key=settings.openai_api_key)
    else:
        from llama_index.embeddings.ollama import OllamaEmbedding
        return OllamaEmbedding(model_name='nomic-embed-text', base_url=settings.ollama_base_url)
