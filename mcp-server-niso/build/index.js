import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
const NISO_BASE_URL = process.env.NISO_BASE_URL || "https://niso.ness.workers.dev";
const NISO_API_KEY = process.env.NISO_API_KEY;
// Papel do agente: "consultant" | "auditor" | "" (todos). Cada papel só enxerga e
// executa o seu conjunto de ferramentas — o auditor nunca escreve implementação
// (política, SoA), o consultor nunca registra achado de auditoria. Independência
// estrutural (cláusula 9.2) na própria camada MCP.
const NISO_ROLE = (process.env.NISO_ROLE || "").toLowerCase();
// Trava dura opcional: só leitura, ignora qualquer escrita (observador puro).
const NISO_READONLY = /^(1|true|yes|on)$/i.test(process.env.NISO_READONLY || "");
// Pin de projeto: fixa a sessão num projeto — tools com projectId recusam outro.
const NISO_PROJECT_ID = process.env.NISO_PROJECT_ID || "";
if (!NISO_API_KEY) {
    console.error("Warning: NISO_API_KEY environment variable is not set.");
}
const server = new Server({
    name: "niso-server",
    version: "1.2.0",
}, {
    capabilities: {
        tools: {},
    },
});
const WRITE_GUARDRAIL = "ESCRITA em projeto de cliente: requer contrato ativo e aprovação humana prévia (ver constituição do Aegis-Consultor).";
// ── Classes de ferramenta por papel ──────────────────────────────────────────
const READ_TOOLS = new Set([
    "niso_list_projects",
    "niso_get_project",
    "niso_list_controls",
    "niso_list_risks",
    "niso_gap_analysis",
    "niso_traceability",
    "niso_list_evidence",
    "niso_audit_pack",
]);
// Escrita exclusiva do auditor (achados e notas de auditoria).
const AUDITOR_WRITE_TOOLS = new Set([
    "niso_create_audit_finding",
    "niso_create_auditor_note",
]);
// Qualquer escrita que não seja do auditor é do consultor (implementação).
function isConsultantWrite(name) {
    return !READ_TOOLS.has(name) && !AUDITOR_WRITE_TOOLS.has(name);
}
// Uma ferramenta é permitida conforme o papel configurado.
function toolAllowed(name) {
    if (NISO_READONLY)
        return READ_TOOLS.has(name);
    if (NISO_ROLE === "auditor")
        return READ_TOOLS.has(name) || AUDITOR_WRITE_TOOLS.has(name);
    if (NISO_ROLE === "consultant")
        return READ_TOOLS.has(name) || isConsultantWrite(name);
    return true; // sem papel definido → todas as ferramentas
}
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
    {
        name: "niso_import_training",
        description: `Import employee training records in bulk from an external source. ${WRITE_GUARDRAIL}`,
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project ID" },
                records: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            employee_name: { type: "string" },
                            training_name: { type: "string" },
                            completion_date: { type: "string", description: "Format: YYYY-MM-DD" },
                            score: { type: "number" },
                            status: { type: "string", description: "Completed or Pending" },
                        },
                        required: ["employee_name", "training_name"],
                    },
                    description: "List of training records to import",
                },
            },
            required: ["projectId", "records"],
        },
    },
    {
        name: "niso_create_asset",
        description: `Create a new asset entry in the project's asset inventory. ${WRITE_GUARDRAIL}`,
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project ID" },
                name: { type: "string", description: "Name of the asset (e.g. AWS RDS Database)" },
                type: { type: "string", description: "Type of asset (e.g. software, hardware, data, people)" },
                criticality: { type: "string", description: "Asset criticality (Low, Medium, High, Critical)" },
                owner: { type: "string", description: "Asset owner name" },
                location: { type: "string", description: "Asset location or system URL" },
            },
            required: ["projectId", "name", "type", "criticality"],
        },
    },
    {
        name: "niso_create_audit_finding",
        description: `Create a new audit finding. If non-conforming, it automatically creates a linked Corrective Action (CAPA). ${WRITE_GUARDRAIL}`,
        inputSchema: {
            type: "object",
            properties: {
                auditId: { type: "string", description: "The audit schedule ID" },
                projectId: { type: "string", description: "The project ID" },
                controlId: { type: "string", description: "The control ID (e.g. ctrl-a51)" },
                findingType: { type: "string", description: "Type: conforming, minor_nc, major_nc, observation" },
                description: { type: "string", description: "Detailed description of the finding" },
                evidenceReviewed: { type: "string", description: "Description of evidence reviewed" },
                auditorNotes: { type: "string", description: "Additional auditor internal notes" },
            },
            required: ["auditId", "projectId", "controlId", "findingType", "description"],
        },
    },
    {
        name: "niso_create_auditor_note",
        description: `Submit a question or clarification request for a control using an auditor token. ${WRITE_GUARDRAIL}`,
        inputSchema: {
            type: "object",
            properties: {
                token: { type: "string", description: "The auditor token" },
                controlId: { type: "string", description: "The control ID (e.g. ctrl-a51)" },
                noteType: { type: "string", description: "Type: question, observation, request" },
                content: { type: "string", description: "Content of the request or question" },
            },
            required: ["token", "controlId", "content"],
        },
    },
    {
        name: "niso_respond_auditor_note",
        description: `Provide a response to an auditor note or request. ${WRITE_GUARDRAIL}`,
        inputSchema: {
            type: "object",
            properties: {
                noteId: { type: "string", description: "The ID of the auditor note" },
                response: { type: "string", description: "Response text to address the auditor question" },
            },
            required: ["noteId", "response"],
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
    // Cada papel enxerga só as suas ferramentas.
    return { tools: TOOLS.filter((t) => toolAllowed(t.name)) };
});
const projectIdSchema = z.object({ projectId: z.string() });
// Recusa chamada a projeto diferente do fixado por NISO_PROJECT_ID.
function assertProject(projectId) {
    if (NISO_PROJECT_ID && projectId !== NISO_PROJECT_ID) {
        throw new Error(`Servidor fixado ao projeto ${NISO_PROJECT_ID} (NISO_PROJECT_ID) — chamada ao projeto ${projectId} recusada.`);
    }
}
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        // Defesa em profundidade: o papel não executa ferramenta fora do seu conjunto.
        if (!toolAllowed(name)) {
            throw new Error(`Ferramenta ${name} indisponível para o papel configurado (NISO_ROLE=${NISO_ROLE || "—"}${NISO_READONLY ? ", NISO_READONLY" : ""}).`);
        }
        switch (name) {
            case "niso_list_projects": {
                return await nisoGet(`/api/v1/portfolio`);
            }
            case "niso_get_project": {
                const { projectId } = projectIdSchema.parse(args);
                assertProject(projectId);
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
                assertProject(validated.projectId);
                return await nisoPost(`/api/v1/projects/${validated.projectId}/risks`, validated);
            }
            case "niso_list_controls": {
                const { projectId } = projectIdSchema.parse(args);
                assertProject(projectId);
                return await nisoGet(`/api/v1/projects/${projectId}/controls`);
            }
            case "niso_list_risks": {
                const { projectId } = projectIdSchema.parse(args);
                assertProject(projectId);
                return await nisoGet(`/api/v1/projects/${projectId}/risks`);
            }
            case "niso_gap_analysis": {
                const { projectId } = projectIdSchema.parse(args);
                assertProject(projectId);
                return await nisoGet(`/api/v1/projects/${projectId}/gap-analysis`);
            }
            case "niso_traceability": {
                const { projectId } = projectIdSchema.parse(args);
                assertProject(projectId);
                return await nisoGet(`/api/v1/projects/${projectId}/traceability`);
            }
            case "niso_list_evidence": {
                const { projectId } = projectIdSchema.parse(args);
                assertProject(projectId);
                return await nisoGet(`/api/v1/projects/${projectId}/evidence`);
            }
            case "niso_audit_pack": {
                const { projectId } = projectIdSchema.parse(args);
                assertProject(projectId);
                return await nisoGet(`/api/v1/projects/${projectId}/audit-pack`);
            }
            case "niso_generate_policy": {
                const { projectId, controlId } = z
                    .object({ projectId: z.string(), controlId: z.string().optional() })
                    .parse(args);
                assertProject(projectId);
                return await nisoPost(`/api/v1/projects/${projectId}/generate-policy`, {
                    control_id: controlId,
                });
            }
            case "niso_generate_soa": {
                const { projectId } = projectIdSchema.parse(args);
                assertProject(projectId);
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
                assertProject(projectId);
                return await nisoPost(`/api/v1/projects/${projectId}/generate-policies-bulk`, {
                    control_ids: controlIds,
                });
            }
            case "niso_migrate_27701": {
                const { projectId } = projectIdSchema.parse(args);
                assertProject(projectId);
                return await nisoPost(`/api/v1/projects/${projectId}/migrate-27701`);
            }
            case "niso_import_training": {
                const schema = z.object({
                    projectId: z.string(),
                    records: z.array(z.object({
                        employee_name: z.string(),
                        training_name: z.string(),
                        completion_date: z.string().optional(),
                        score: z.number().optional(),
                        status: z.string().optional(),
                    })),
                });
                const validated = schema.parse(args);
                assertProject(validated.projectId);
                return await nisoPost(`/api/v1/projects/${validated.projectId}/training/import-external`, {
                    records: validated.records,
                });
            }
            case "niso_create_asset": {
                const schema = z.object({
                    projectId: z.string(),
                    name: z.string(),
                    type: z.string(),
                    criticality: z.string(),
                    owner: z.string().optional(),
                    location: z.string().optional(),
                });
                const validated = schema.parse(args);
                assertProject(validated.projectId);
                return await nisoPost(`/api/v1/projects/${validated.projectId}/assets`, validated);
            }
            case "niso_create_audit_finding": {
                const schema = z.object({
                    auditId: z.string(),
                    projectId: z.string(),
                    controlId: z.string(),
                    findingType: z.string(),
                    description: z.string(),
                    evidenceReviewed: z.string().optional(),
                    auditorNotes: z.string().optional(),
                });
                const validated = schema.parse(args);
                assertProject(validated.projectId);
                return await nisoPost(`/api/v1/audits/${validated.auditId}/findings`, {
                    project_id: validated.projectId,
                    control_id: validated.controlId,
                    finding_type: validated.findingType,
                    description: validated.description,
                    evidence_reviewed: validated.evidenceReviewed,
                    auditor_notes: validated.auditorNotes,
                });
            }
            case "niso_create_auditor_note": {
                const schema = z.object({
                    token: z.string(),
                    controlId: z.string(),
                    noteType: z.string().optional(),
                    content: z.string(),
                });
                const validated = schema.parse(args);
                return await nisoPost(`/api/v1/auditor/${validated.token}/notes`, {
                    control_id: validated.controlId,
                    note_type: validated.noteType || "question",
                    content: validated.content,
                });
            }
            case "niso_respond_auditor_note": {
                const schema = z.object({
                    noteId: z.string(),
                    response: z.string(),
                });
                const validated = schema.parse(args);
                return await nisoPost(`/api/v1/auditor-notes/${validated.noteId}/respond`, {
                    response: validated.response,
                });
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
