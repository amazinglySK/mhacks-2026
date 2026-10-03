Alright, I'm at a hackathon, and we need godspeed. I'm building a plugin/app that sits on iMessage, can be invoked to monitor a conversation, identified connected debts like splitwise, then reports it to splitwise. The full idea is mentioned in @idea.md

I think there are a few phases and layers we need to work on. First the agent: make sure the agent is capable of identifying this graph of debts from natural language and help users with identifying their debts. The agent should be able to converse and understand the details of an event and how the split works. Sometimes this could also be in the form of an image first that the user sends in a group chat and then a conversation of who did what. For that we could use some sort of OCR model in the workflow/agent that we create.

The way I'm imagining the agent is that it's gonna be a simple chat model combined with skills/tools that help it perform actions.

Next, we have a mini-backend that acts as a gateway between the debts it deciphered and transferring it to Splitwise API.

Final layer/aspect is gonna be connecting this agent using photon.

The docs for photon is @photon_spectrum_ts_docs_index.md and docs for the splitwise api is in the form of an openapi spec sheet @openapi-splitwise-api.json. Also docs for spacetime should be available at https://spacetimedb.com/docs/ (I don't have an index for this since I don't know which exact module we'll be using).