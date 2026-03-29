import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq

# 1. Load the variables from the .env file
load_dotenv()

print(f"LangSmith Tracing enabled for project: {os.environ.get('LANGCHAIN_PROJECT')}")

# 2. Initialize the Groq LLM (UPDATED MODEL NAME HERE)
llm = ChatGroq(
    model="llama-3.1-8b-instant", 
    temperature=0 
)

# 3. Test the LLM
print("Sending test query to Groq...")
response = llm.invoke("Hi! Please reply with 'System is operational!' if you receive this.")

print("\n--- Response ---")
print(response.content)