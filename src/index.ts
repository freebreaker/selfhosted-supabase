import { Command } from 'commander';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { SelfhostedSupabaseClient } from './client/index.js';
import { listTablesTool } from './tools/list_tables.js';
import { listExtensionsTool } from './tools/list_extensions.js';
import { listMigrationsTool } from './tools/list_migrations.js';
import { applyMigrationTool } from './tools/apply_migration.js';
import { executeSqlTool } from './tools/execute_sql.js';
import { getDatabaseConnectionsTool } from './tools/get_database_connections.js';
import { getDatabaseStatsTool } from './tools/get_database_stats.js';
import { getProjectUrlTool } from './tools/get_project_url.js';
import { getAnonKeyTool } from './tools/get_anon_key.js';
import { getServiceKeyTool } from './tools/get_service_key.js';
import { generateTypesTool } from './tools/generate_typescript_types.js';
import { rebuildHooksTool } from './tools/rebuild_hooks.js';
import { verifyJwtSecretTool } from './tools/verify_jwt_secret.js';
import { listAuthUsersTool } from './tools/list_auth_users.js';
import { getAuthUserTool } from './tools/get_auth_user.js';
import { deleteAuthUserTool } from './tools/delete_auth_user.js';
import { createAuthUserTool } from './tools/create_auth_user.js';
import { updateAuthUserTool } from './tools/update_auth_user.js';
import { z } from 'zod';
import type { ToolContext } from './tools/types.js';
import listStorageBucketsTool from './tools/list_storage_buckets.js';
import listStorageObjectsTool from './tools/list_storage_objects.js';
import listRealtimePublicationsTool from './tools/list_realtime_publications.js';

// Node.js built-in modules
import * as fs from 'node:fs';
import * as path from 'node:path';

// Define the structure expected by MCP for tool definitions
interface McpToolSchema {
    name: string;
    description?: string;
    // inputSchema is the JSON Schema object for MCP capabilities
    inputSchema: object; 
}

// Base structure for our tool objects - For Reference
interface AppTool {
    name: string;
    description: string;
    inputSchema: z.ZodTypeAny; // Zod schema for parsing
    mcpInputSchema: object;    // Static JSON schema for MCP (Required)
    outputSchema: z.ZodTypeAny; // Zod schema for output (optional)
    execute: (input: unknown, context: ToolContext) => Promise<unknown>;
}

// Create Express app
const app = express();
const PORT = process.env.PORT || 8081;

// CORS configuration for browser-based MCP clients
app.use(cors({
    origin: '*', // Configure appropriately for production
    exposedHeaders: ['Mcp-Session-Id', 'mcp-protocol-version'],
    allowedHeaders: ['Content-Type', 'mcp-session-id'],
}));

app.use(express.json());

// Create MCP server function
async function createMcpServer(config: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    supabaseServiceRoleKey?: string;
    databaseUrl?: string;
    jwtSecret?: string;
    workspacePath?: string;
    toolsConfig?: string;
}) {
    console.error('Initializing Self-Hosted Supabase MCP Server...');

    const selfhostedClient = await SelfhostedSupabaseClient.create({
        supabaseUrl: config.supabaseUrl,
        supabaseAnonKey: config.supabaseAnonKey,
        supabaseServiceRoleKey: config.supabaseServiceRoleKey,
        databaseUrl: config.databaseUrl,
        jwtSecret: config.jwtSecret,
    });

    console.error('Supabase client initialized successfully.');

    const availableTools = {
        [listTablesTool.name]: listTablesTool as AppTool,
        [listExtensionsTool.name]: listExtensionsTool as AppTool,
        [listMigrationsTool.name]: listMigrationsTool as AppTool,
        [applyMigrationTool.name]: applyMigrationTool as AppTool,
        [executeSqlTool.name]: executeSqlTool as AppTool,
        [getDatabaseConnectionsTool.name]: getDatabaseConnectionsTool as AppTool,
        [getDatabaseStatsTool.name]: getDatabaseStatsTool as AppTool,
        [getProjectUrlTool.name]: getProjectUrlTool as AppTool,
        [getAnonKeyTool.name]: getAnonKeyTool as AppTool,
        [getServiceKeyTool.name]: getServiceKeyTool as AppTool,
        [generateTypesTool.name]: generateTypesTool as AppTool,
        [rebuildHooksTool.name]: rebuildHooksTool as AppTool,
        [verifyJwtSecretTool.name]: verifyJwtSecretTool as AppTool,
        [listAuthUsersTool.name]: listAuthUsersTool as AppTool,
        [getAuthUserTool.name]: getAuthUserTool as AppTool,
        [deleteAuthUserTool.name]: deleteAuthUserTool as AppTool,
        [createAuthUserTool.name]: createAuthUserTool as AppTool,
        [updateAuthUserTool.name]: updateAuthUserTool as AppTool,
        [listStorageBucketsTool.name]: listStorageBucketsTool as AppTool,
        [listStorageObjectsTool.name]: listStorageObjectsTool as AppTool,
        [listRealtimePublicationsTool.name]: listRealtimePublicationsTool as AppTool,
    };

    // Tool filtering logic
    let registeredTools: Record<string, AppTool> = { ...availableTools };
    const toolsConfigPath = config.toolsConfig;
    let enabledToolNames: Set<string> | null = null;

    if (toolsConfigPath) {
        try {
            const resolvedPath = path.resolve(toolsConfigPath);
            console.error(`Attempting to load tool configuration from: ${resolvedPath}`);
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`Tool configuration file not found at ${resolvedPath}`);
            }
            const configFileContent = fs.readFileSync(resolvedPath, 'utf-8');
            const configJson = JSON.parse(configFileContent);

            if (!configJson || typeof configJson !== 'object' || !Array.isArray(configJson.enabledTools)) {
                throw new Error('Invalid config file format. Expected { "enabledTools": ["tool1", ...] }.');
            }

            const toolNames = configJson.enabledTools as unknown[];
            if (!toolNames.every((name): name is string => typeof name === 'string')) {
                throw new Error('Invalid config file content. "enabledTools" must be an array of strings.');
            }

            enabledToolNames = new Set(toolNames.map(name => name.trim()).filter(name => name.length > 0));
        } catch (error: unknown) {
            console.error(`Error loading or parsing tool config file '${toolsConfigPath}':`, error instanceof Error ? error.message : String(error));
            console.error('Falling back to enabling all tools due to config error.');
            enabledToolNames = null;
        }
    }

    if (enabledToolNames !== null) {
        console.error(`Whitelisting tools based on config: ${Array.from(enabledToolNames).join(', ')}`);
        registeredTools = {};
        for (const toolName in availableTools) {
            if (enabledToolNames.has(toolName)) {
                registeredTools[toolName] = availableTools[toolName];
            } else {
                console.error(`Tool ${toolName} disabled (not in config whitelist).`);
            }
        }

        for (const requestedName of enabledToolNames) {
            if (!availableTools[requestedName]) {
                console.warn(`Warning: Tool "${requestedName}" specified in config file not found.`);
            }
        }
    } else {
        console.error("No valid --tools-config specified or error loading config, enabling all available tools.");
    }

    // Prepare capabilities
    const capabilitiesTools: Record<string, McpToolSchema> = {};
    for (const tool of Object.values(registeredTools)) {
        const staticInputSchema = tool.mcpInputSchema || { type: 'object', properties: {} };
        if (!tool.mcpInputSchema) {
            console.error(`Tool ${tool.name} is missing mcpInputSchema. Using default empty schema.`);
        }
        capabilitiesTools[tool.name] = {
            name: tool.name,
            description: tool.description || 'Tool description missing',
            inputSchema: staticInputSchema,
        };
    }

    const capabilities = { tools: capabilitiesTools };

    console.error('Initializing MCP Server...');
    const server = new Server(
        {
            name: 'self-hosted-supabase-mcp',
            version: '1.0.0',
        },
        {
            capabilities,
        },
    );

    // Set up handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: Object.values(capabilities.tools),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const toolName = request.params.name;
        const tool = registeredTools[toolName as keyof typeof registeredTools];

        if (!tool) {
            if (availableTools[toolName as keyof typeof availableTools]) {
                throw new McpError(ErrorCode.MethodNotFound, `Tool "${toolName}" is available but not enabled by the current server configuration.`);
            }
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
        }

        try {
            if (typeof tool.execute !== 'function') {
                throw new Error(`Tool ${toolName} does not have an execute method.`);
            }

            let parsedArgs = request.params.arguments;
            if (tool.inputSchema && typeof tool.inputSchema.parse === 'function') {
                parsedArgs = (tool.inputSchema as z.ZodTypeAny).parse(request.params.arguments);
            }

            const context: ToolContext = {
                selfhostedClient,
                workspacePath: config.workspacePath || process.cwd(),
                log: (message, level = 'info') => {
                    console.error(`[${level.toUpperCase()}] ${message}`);
                }
            };

            const result = await tool.execute(parsedArgs as any, context);

            return {
                content: [
                    {
                        type: 'text',
                        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                    },
                ],
            };
        } catch (error: unknown) {
            console.error(`Error executing tool ${toolName}:`, error);
            let errorMessage = `Error executing tool ${toolName}: `;
            if (error instanceof z.ZodError) {
                errorMessage += `Input validation failed: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
            } else if (error instanceof Error) {
                errorMessage += error.message;
            } else {
                errorMessage += String(error);
            }
            return {
                content: [{ type: 'text', text: errorMessage }],
                isError: true,
            };
        }
    });

    return server;
}

// Handle MCP requests at /mcp endpoint
app.all('/mcp', async (req: Request, res: Response) => {
    try {
        // Parse configuration from query parameters (sent by Smithery)
        const config = {
            supabaseUrl: req.query.supabaseUrl as string || process.env.SUPABASE_URL,
            supabaseAnonKey: req.query.supabaseAnonKey as string || process.env.SUPABASE_ANON_KEY,
            supabaseServiceRoleKey: req.query.supabaseServiceRoleKey as string || process.env.SUPABASE_SERVICE_ROLE_KEY,
            databaseUrl: req.query.databaseUrl as string || process.env.DATABASE_URL,
            jwtSecret: req.query.supabaseAuthJwtSecret as string || process.env.SUPABASE_AUTH_JWT_SECRET,
            workspacePath: req.query.workspacePath as string || process.cwd(),
            toolsConfig: req.query.toolsConfig as string,
        };

        // Validate required parameters
        if (!config.supabaseUrl) {
            return res.status(400).json({
                jsonrpc: '2.0',
                error: { code: -32602, message: 'Missing required parameter: supabaseUrl' },
                id: null,
            });
        }
        if (!config.supabaseAnonKey) {
            return res.status(400).json({
                jsonrpc: '2.0',
                error: { code: -32602, message: 'Missing required parameter: supabaseAnonKey' },
                id: null,
            });
        }

        const server = await createMcpServer(config as {
            supabaseUrl: string;
            supabaseAnonKey: string;
            supabaseServiceRoleKey?: string;
            databaseUrl?: string;
            jwtSecret?: string;
            workspacePath?: string;
            toolsConfig?: string;
        });
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });

        // Clean up on request close
        res.on('close', () => {
            transport.close();
            server.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: { code: -32603, message: 'Internal server error' },
                id: null,
            });
        }
    }
});

// Main function
async function main() {
    const transport = process.env.TRANSPORT || 'stdio';
    
    if (transport === 'http') {
        // Run in HTTP mode
        app.listen(PORT, () => {
            console.error(`MCP HTTP Server listening on port ${PORT}`);
        });
    } else {
        // STDIO mode for backward compatibility
        const program = new Command();

        program
            .name('self-hosted-supabase-mcp')
            .description('MCP Server for self-hosted Supabase instances')
            .option('--url <url>', 'Supabase project URL', process.env.SUPABASE_URL)
            .option('--anon-key <key>', 'Supabase anonymous key', process.env.SUPABASE_ANON_KEY)
            .option('--service-key <key>', 'Supabase service role key (optional)', process.env.SUPABASE_SERVICE_ROLE_KEY)
            .option('--db-url <url>', 'Direct database connection string (optional, for pg fallback)', process.env.DATABASE_URL)
            .option('--jwt-secret <secret>', 'Supabase JWT secret (optional, needed for some tools)', process.env.SUPABASE_AUTH_JWT_SECRET)
            .option('--workspace-path <path>', 'Workspace root path (for file operations)', process.cwd())
            .option('--tools-config <path>', 'Path to a JSON file specifying which tools to enable (e.g., { "enabledTools": ["tool1", "tool2"] }). If omitted, all tools are enabled.')
            .parse(process.argv);

        const options = program.opts();

        if (!options.url) {
            console.error('Error: Supabase URL is required. Use --url or SUPABASE_URL.');
            throw new Error('Supabase URL is required.');
        }
        if (!options.anonKey) {
            console.error('Error: Supabase Anon Key is required. Use --anon-key or SUPABASE_ANON_KEY.');
            throw new Error('Supabase Anon Key is required.');
        }

        const config = {
            supabaseUrl: options.url,
            supabaseAnonKey: options.anonKey,
            supabaseServiceRoleKey: options.serviceKey,
            databaseUrl: options.dbUrl,
            jwtSecret: options.jwtSecret,
            workspacePath: options.workspacePath,
            toolsConfig: options.toolsConfig,
        };

        const server = await createMcpServer(config);
        const stdioTransport = new StdioServerTransport();
        await server.connect(stdioTransport);
        console.error('MCP Server running in stdio mode');
    }
}

main().catch((error) => {
    console.error('Unhandled error in main function:', error);
    process.exit(1); // Exit with error code
});