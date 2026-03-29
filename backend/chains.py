import os
import warnings
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

try:
    from langchain_core._api.deprecation import LangChainDeprecationWarning
except Exception:
    LangChainDeprecationWarning = Warning

warnings.filterwarnings(
    "ignore",
    message=r"The class `Chroma` was deprecated in LangChain 0\.2\.9.*",
    category=LangChainDeprecationWarning,
)

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
ENV_PATH = os.path.join(PROJECT_ROOT, ".env")
VECTOR_DB_DIR = os.path.join(PROJECT_ROOT, "chroma_db")

load_dotenv(ENV_PATH)

# ==========================================
# 1. SETUP RETRIEVER
# ==========================================
print("Loading Vector Database...")
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
vectorstore = Chroma(persist_directory=VECTOR_DB_DIR, embedding_function=embeddings)
retriever = vectorstore.as_retriever(search_kwargs={"k": 2})

# ==========================================
# 2. SETUP LLM
# ==========================================
llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0)

# ==========================================
# 3. THE GRADER (Checks if in syllabus)
# ==========================================
system_grader = """You are an intelligent syllabus grader assessing whether retrieved documents are relevant to a user's question.

RULES:
1. CHITCHAT/GREETINGS: If the user's input is a simple greeting or casual conversation (e.g., "hi", "hello", "how are you", "thank you", "who are you"), ALWAYS grade it as 'yes'.
2. RELEVANT: If the question is about course topics, syllabus structure, marks, or concepts and the document is related, grade it as 'yes'.
3. IRRELEVANT / OUT OF SYLLABUS: If the question is unrelated to the course content or the retrieved document does not support it, grade it as 'no'.

Output exactly 'yes' or 'no' without any extra words or punctuation."""

grade_prompt = ChatPromptTemplate.from_messages([
    ("system", system_grader),
    ("human", "Retrieved document: \n\n {document} \n\n Student question: {question}"),
])

retrieval_grader = grade_prompt | llm | StrOutputParser()

# ==========================================
# 4. THE GENERATOR (Answers syllabus questions)
# ==========================================
system_generator = """You are CRAG IOE Chatbot, a friendly and highly clear AI teaching assistant for IOE students.

RESPONSE QUALITY RULES:
1. Start with a direct answer in 1-2 lines.
2. Then give concise bullet points for key ideas (3-6 bullets).
3. Use simple student-friendly language and avoid long walls of text.
4. If the user asks a definition, include:
   - What it is
   - Why it matters
   - One short example
5. If the question is syllabus-related, prioritize provided context.
6. If detail is outside syllabus context, still answer briefly and add:
   "(Note: This specific detail might not be in your syllabus)."
7. For greetings/chitchat, reply naturally in 1-2 short lines.

Formatting rules:
- Use short paragraphs and bullet points.
- No unnecessary repetition.
- Keep most answers under 160 words unless user asks for depth.

Course Context:
{context}"""

generate_prompt = ChatPromptTemplate.from_messages([
    ("system", system_generator),
    ("human", "{question}"),
])

rag_chain = generate_prompt | llm

# ==========================================
# 5. WEB SEARCH ANSWER STYLER
# ==========================================
system_websearch_formatter = """You are CRAG IOE Chatbot.
You are given a student's question and raw web search snippets.
Write a clean, student-friendly answer in natural flow.

Rules:
1. Do not force rigid section templates or repeated heading blocks.
2. Start with a clear direct response, then add short bullet points only when useful.
3. Use only the provided snippets and never invent facts.
4. If something is uncertain or conflicting in the snippets, state that clearly.
5. Keep the response concise and easy to read.
"""

websearch_prompt = ChatPromptTemplate.from_messages([
    ("system", system_websearch_formatter),
    (
        "human",
        "Student question: {question}\n\nRaw web snippets:\n{web_results}",
    ),
])

websearch_answer_chain = websearch_prompt | llm | StrOutputParser()

