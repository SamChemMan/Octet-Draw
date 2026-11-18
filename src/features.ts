// Features a release can leave out. Release 1.1.3 ships with the AI features off (Sam, 18 November 2026: the MCP
// needs more testing), and 1.2 turns them on: the connection for AI apps (the MCP server, its relay and Octet with no
// window), connecting the AI apps on the computer, Settings > AI tools, the AI card, and Image to Structure. The code
// stays; with AI false none of it starts or shows. src-tauri/src/main.rs has the same switch (AI).
export const AI = false;
