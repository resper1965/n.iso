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
    version: "1.1.0",
}, {
    capabilities: {
        tools: {},
    },
});
const WRITE_GUARDRAIL = "ESCRITA em projeto de cliente: requer contrato ativo e aprovação humana prévia (ver constituição do Aegis-Consultor).";
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
        description: `Create a new risk entry in a project's risk matrix. ${WRITE_GUARDRAIL}`,
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
    {
        name: "niso_list_risks",
        description: "List all risks in a project's risk register",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project ID" },
            },
            required: ["projectId"],
        },
    },
    {
        name: "niso_gap_analysis",
        description: "Run the project's gap analysis: control coverage %, breakdown by status, and the list of open gaps",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project ID" },
            },
            required: ["projectId"],
        },
    },
    {
        name: "niso_traceability",
        description: "Get the project's traceability matrix linking risks -> controls -> evidence",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project ID" },
            },
            required: ["projectId"],
        },
    },
    {
        name: "niso_list_evidence",
        description: "List all evidence records for a project",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project ID" },
            },
            required: ["projectId"],
        },
    },
    {
        name: "niso_audit_pack",
        description: "Download the audit readiness pack (consolidated JSON: project, phases, controls, evidence, audit trail)",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project ID" },
            },
            required: ["projectId"],
        },
    },
    {
        name: "niso_generate_policy",
        description: `Generate a policy document for a control via the nISO PolicyAgent (AI draft — must be reviewed before approval). ${WRITE_GUARDRAIL}`,
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project ID" },
                controlId: {
                    type: "string",
                    description: "The ISO 27001:2022 Annex A control ID (e.g., A.5.1). Defaults to A.5.1",
                },
            },
            required: ["projectId"],
        },
    },
    {
        name: "niso_generate_soa",
        description: `Generate the Statement of Applicability draft (93 controls) from the project's assessment answers, creating compliance controls. ${WRITE_GUARDRAIL}`,
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project ID" },
            },
            required: ["projectId"],
        },
    },
    {
        name: "niso_evaluate_evidence",
        description: `AI pre-qualification of an evidence record (CONFORME/PARCIAL/NAO CONFORME draft — not an audit verdict). Requires the extracted text of the evidence document. ${WRITE_GUARDRAIL}`,
        inputSchema: {
            type: "object",
            properties: {
                evidenceId: { type: "string", description: "The evidence record ID" },
                text: { type: "string", description: "Extracted text content of the evidence document" },
            },
            required: ["evidenceId", "text"],
        },
    },
    {
        name: "niso_generate_policies_bulk",
        description: `Generate multiple policy documents sequentially via AI. NEVER run autonomously — bulk generation ALWAYS requires explicit human approval in the active contract. ${WRITE_GUARDRAIL}`,
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project ID" },
                controlIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Annex A control IDs to generate policies for (e.g., ['A.5.1','A.5.9']). Defaults to the core organizational set",
                },
            },
            required: ["projectId"],
        },
    },
    {
        name: "niso_migrate_27701",
        description: `Migrate the project's SoA from ISO 27001:2013 to 2022 mapping and identify ISO 27701 gaps, creating new controls. ${WRITE_GUARDRAIL}`,
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project ID" },
            },
            required: ["projectId"],
        },
    },
];
async function nisoGet(path) {
    const response = await fetch(`${NISO_BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${NISO_API_KEY}` },
    });
    const data = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
async function nisoPost(path, body) {
    const response = await fetch(`${NISO_BASE_URL}${path}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${NISO_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: TOOLS,
    };
});
const projectIdSchema = z.object({ projectId: z.string() });
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "niso_list_projects": {
                return await nisoGet(`/api/v1/portfolio`);
            }
            case "niso_get_project": {
                const { projectId } = projectIdSchema.parse(args);
                return await nisoGet(`/api/v1/projects/${projectId}`);
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
                return await nisoPost(`/api/v1/projects/${validated.projectId}/risks`, validated);
            }
            case "niso_list_controls": {
                const { projectId } = projectIdSchema.parse(args);
                return await nisoGet(`/api/v1/projects/${projectId}/controls`);
            }
            case "niso_list_risks": {
                const { projectId } = projectIdSchema.parse(args);
                return await nisoGet(`/api/v1/projects/${projectId}/risks`);
            }
            case "niso_gap_analysis": {
                const { projectId } = projectIdSchema.parse(args);
                return await nisoGet(`/api/v1/projects/${projectId}/gap-analysis`);
            }
            case "niso_traceability": {
                const { projectId } = projectIdSchema.parse(args);
                return await nisoGet(`/api/v1/projects/${projectId}/traceability`);
            }
            case "niso_list_evidence": {
                const { projectId } = projectIdSchema.parse(args);
                return await nisoGet(`/api/v1/projects/${projectId}/evidence`);
            }
            case "niso_audit_pack": {
                const { projectId } = projectIdSchema.parse(args);
                return await nisoGet(`/api/v1/projects/${projectId}/audit-pack`);
            }
            case "niso_generate_policy": {
                const { projectId, controlId } = z
                    .object({ projectId: z.string(), controlId: z.string().optional() })
                    .parse(args);
                return await nisoPost(`/api/v1/projects/${projectId}/generate-policy`, {
                    control_id: controlId,
                });
            }
            case "niso_generate_soa": {
                const { projectId } = projectIdSchema.parse(args);
                return await nisoPost(`/api/v1/projects/${projectId}/generate-soa`);
            }
            case "niso_evaluate_evidence": {
                const { evidenceId, text } = z
                    .object({ evidenceId: z.string(), text: z.string() })
                    .parse(args);
                return await nisoPost(`/api/v1/evidence/${evidenceId}/evaluate`, { text });
            }
            case "niso_generate_policies_bulk": {
                const { projectId, controlIds } = z
                    .object({ projectId: z.string(), controlIds: z.array(z.string()).optional() })
                    .parse(args);
                return await nisoPost(`/api/v1/projects/${projectId}/generate-policies-bulk`, {
                    control_ids: controlIds,
                });
            }
            case "niso_migrate_27701": {
                const { projectId } = projectIdSchema.parse(args);
                return await nisoPost(`/api/v1/projects/${projectId}/migrate-27701`);
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
