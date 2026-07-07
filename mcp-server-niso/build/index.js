import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
const NISO_BASE_URL = process.env.NISO_BASE_URL || "https://niso.ness.workers.dev";
const NISO_API_KEY = process.env.NISO_API_KEY;
if (!NISO_API_KEY) {
    console.error("Warning: NISO_API_KEY environment variable is not set.");
}
const server = new Server({
    name: "niso-server",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
const TOOLS = [
    {
        name: "niso_list_projects",
        description: "List all active GRC projects in the nISO portfolio",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "niso_get_project",
        description: "Get detailed information about a specific project, including phases and progress",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The unique ID of the project" },
            },
            required: ["projectId"],
        },
    },
    {
        name: "niso_create_risk",
        description: "Create a new risk entry in a project's risk matrix",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project ID" },
                asset: { type: "string", description: "The asset at risk (e.g., Customer Data)" },
                threat: { type: "string", description: "The threat (e.g., Data Breach)" },
                vulnerability: { type: "string", description: "The vulnerability (e.g., Unencrypted Storage)" },
                impact: { type: "number", minimum: 1, maximum: 5, description: "Impact score (1-5)" },
                probability: { type: "number", minimum: 1, maximum: 5, description: "Probability score (1-5)" },
            },
            required: ["projectId", "asset", "threat", "impact", "probability"],
        },
    },
    {
        name: "niso_list_controls",
        description: "List all compliance controls for a specific project",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project ID" },
            },
            required: ["projectId"],
        },
    },
];
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: TOOLS,
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "niso_list_projects": {
                const response = await fetch(`${NISO_BASE_URL}/api/v1/portfolio`, {
                    headers: { Authorization: `Bearer ${NISO_API_KEY}` },
                });
                const data = await response.json();
                return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
            }
            case "niso_get_project": {
                const { projectId } = z.object({ projectId: z.string() }).parse(args);
                const response = await fetch(`${NISO_BASE_URL}/api/v1/projects/${projectId}`, {
                    headers: { Authorization: `Bearer ${NISO_API_KEY}` },
                });
                const data = await response.json();
                return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
            }
            case "niso_create_risk": {
                const schema = z.object({
                    projectId: z.string(),
                    asset: z.string(),
                    threat: z.string(),
                    vulnerability: z.string().optional(),
                    impact: z.number(),
                    probability: z.number(),
                });
                const validated = schema.parse(args);
                const response = await fetch(`${NISO_BASE_URL}/api/v1/projects/${validated.projectId}/risks`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${NISO_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(validated),
                });
                const data = await response.json();
                return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
            }
            case "niso_list_controls": {
                const { projectId } = z.object({ projectId: z.string() }).parse(args);
                const response = await fetch(`${NISO_BASE_URL}/api/v1/projects/${projectId}/controls`, {
                    headers: { Authorization: `Bearer ${NISO_API_KEY}` },
                });
                const data = await response.json();
                return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        return {
            isError: true,
            content: [{ type: "text", text: `Error: ${error.message}` }],
        };
    }
});
async function runServer() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("nISO MCP Server running on stdio");
}
runServer().catch(console.error);
