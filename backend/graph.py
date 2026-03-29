from typing import List, TypedDict
from langgraph.graph import END, StateGraph
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.documents import Document
from langchain_community.tools import DuckDuckGoSearchRun

try:
    from .chains import retriever, retrieval_grader, rag_chain, websearch_answer_chain
except ImportError:
    from chains import retriever, retrieval_grader, rag_chain, websearch_answer_chain


class GraphState(TypedDict):
    question: str
    generation: str
    web_search: str
    documents: List[Document]


web_search_tool = DuckDuckGoSearchRun()

CHITCHAT_KEYWORDS = {
    "hi",
    "hello",
    "hey",
    "how are you",
    "thanks",
    "thank you",
    "who are you",
}


def retrieve_node(state: GraphState):
    print("\n--- NODE: RETRIEVE ---")
    question = state["question"]
    documents = retriever.invoke(question)
    return {"documents": documents, "question": question}


def grade_documents_node(state: GraphState):
    print("\n--- NODE: GRADE DOCUMENTS ---")
    question = state["question"]
    documents = state["documents"]
    lowered_question = question.strip().lower()

    if any(keyword in lowered_question for keyword in CHITCHAT_KEYWORDS):
        print("   -> FAST PATH: CHITCHAT")
        return {"documents": [], "question": question, "web_search": "No"}

    if not documents:
        print("   -> NO DOCUMENTS RETRIEVED: FLAG FOR WEB SEARCH!")
        return {"documents": [], "question": question, "web_search": "Yes"}

    joined_documents = "\n\n".join(d.page_content[:700] for d in documents)
    score = retrieval_grader.invoke({"question": question, "document": joined_documents})
    grade = score.strip().lower()
    print(f"   -> BATCH GRADE: {grade}")

    if "yes" not in grade:
        print("   -> ALL DOCUMENTS IRRELEVANT: FLAG FOR WEB SEARCH!")
        return {"documents": [], "question": question, "web_search": "Yes"}

    return {"documents": documents, "question": question, "web_search": "No"}


def generate_node(state: GraphState):
    print("\n--- NODE: GENERATE ANSWER ---")
    question = state["question"]
    documents = state["documents"]

    generation = rag_chain.invoke({"context": documents, "question": question})
    return {"documents": documents, "question": question, "generation": generation.content}


def web_search_node(state: GraphState):
    print("\n--- NODE: EXECUTING WEB SEARCH ---")
    question = state["question"]

    docs = web_search_tool.invoke(question)

    try:
        polished_answer = websearch_answer_chain.invoke(
            {"question": question, "web_results": docs}
        )
        return {"generation": polished_answer, "question": question}
    except Exception:
        # Fallback if formatter fails for any reason
        msg = f"I found web results, but could not format them cleanly.\n\nRaw web results:\n{docs}"
        return {"generation": msg, "question": question}


def decide_to_generate(state: GraphState):
    if state["web_search"] == "Yes":
        return "websearch"
    return "generate"


workflow = StateGraph(GraphState)

workflow.add_node("retrieve", retrieve_node)
workflow.add_node("grade_documents", grade_documents_node)
workflow.add_node("generate", generate_node)
workflow.add_node("websearch", web_search_node)

workflow.set_entry_point("retrieve")
workflow.add_edge("retrieve", "grade_documents")

workflow.add_conditional_edges(
    "grade_documents",
    decide_to_generate,
    {"websearch": "websearch", "generate": "generate"},
)

workflow.add_edge("generate", END)
workflow.add_edge("websearch", END)

memory = MemorySaver()
app = workflow.compile(checkpointer=memory, interrupt_before=["websearch"])
