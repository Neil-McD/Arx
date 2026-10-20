// content.js: the community's words. Edit freely: the site reads everything
// here. Leave a value null to use what Polynet knows (the community's name,
// one-liner and description from its settings).

export const content = {
  // Public page (visitors who aren't signed in)
  headline: null,          // default: the community's name
  tagline: null,           // default: the community's one-liner
  about: null,             // default: the community's description (markdown)
  joinLabel: "Join the community",
  whatYouGet: [
    { title: "Conversations", text: "Channels for everything the community talks about, live." },
    { title: "Events", text: "What's coming up, in your time zone." },
    { title: "Courses", text: "Lessons and guides the community has put together." },
    { title: "The community agent", text: "An AI that knows this community and answers members' questions." },
  ],

  // Navigation labels (signed in)
  nav: {
    home: "Home",
    chat: "Channels",
    events: "Events",
    courses: "Courses",
    knowledge: "Knowledge",
    members: "Members",
    agent: "Ask the agent",
  },

  // Small words around the site
  composerPlaceholder: "Write a message…",
  agentPlaceholder: "Ask anything about the community…",
  footer: "Powered by Polynet",
};
