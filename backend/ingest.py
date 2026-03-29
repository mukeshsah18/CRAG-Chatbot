import os
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))

# --- Configuration ---
PDF_FILE_PATH = os.path.join(PROJECT_ROOT, "syllabus.pdf")
VECTOR_DB_DIR = os.path.join(PROJECT_ROOT, "chroma_db")

def ingest_syllabus():
    print("1. Looking for syllabus PDF...")
    if not os.path.exists(PDF_FILE_PATH):
        print(f" Error: Could not find '{PDF_FILE_PATH}'. Please put a PDF in this folder.")
        return

    print("2. Loading PDF...")
    loader = PyPDFLoader(PDF_FILE_PATH)
    documents = loader.load()
    print(f"   -> Loaded {len(documents)} pages.")

    print("3. Splitting text into chunks...")
    # We split text so the LLM gets small, accurate pieces of context
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        add_start_index=True
    )
    chunks = text_splitter.split_documents(documents)
    print(f"   -> Split into {len(chunks)} chunks.")

    print("4. Adding Metadata...")
    # This metadata will help our system know this text is strictly from the syllabus
    for chunk in chunks:
        chunk.metadata["is_syllabus"] = True
        # Future enhancement: dynamically extract Topic/Marks and add them here
        # chunk.metadata["topic"] = "..."
        # chunk.metadata["marks"] = 10

    print("5. Initializing Local Embedding Model (Downloading if first time)...")
    # Using a fast, local embedding model (no API costs!)
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

    print("6. Saving to Local Chroma Vector Database...")
    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=VECTOR_DB_DIR
    )

    print(f" Success! Vector database saved locally at '{VECTOR_DB_DIR}'.")

if __name__ == "__main__":
    ingest_syllabus()
