import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Realty Pandit API',
            version: '1.0.0',
            description: 'Realty Pandit Backend API - AI-Powered Real Estate Platform',
            contact: { name: 'Realty Pandit Team' },
        },
        servers: [
            { url: 'http://localhost:{port}', variables: { port: { default: '7071' } } },
        ],
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Staff JWT token from /auth/login',
                },
                AgentBearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Partner Agent JWT from /agent/verify-otp',
                },
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key',
                    description: 'External integration API key',
                },
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                    },
                },
                ValidationError: {
                    type: 'object',
                    properties: {
                        error: { type: 'string', example: 'Validation failed' },
                        details: { type: 'array', items: { type: 'string' } },
                    },
                },
                Property: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        category: { type: 'string' },
                        type: { type: 'string' },
                        location: { type: 'string' },
                        price: { type: 'number' },
                        price_unit: { type: 'string' },
                        intent: { type: 'string' },
                        specs: { type: 'object' },
                        features: { type: 'object' },
                        media_urls: { type: 'array', items: { type: 'string' } },
                        status: { type: 'string' },
                        created_at: { type: 'string', format: 'date-time' },
                    },
                },
                Contact: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        phone: { type: 'string' },
                        email: { type: 'string' },
                    },
                },
            },
        },
        tags: [
            { name: 'Auth', description: 'Authentication & authorization' },
            { name: 'Public', description: 'Public API (no auth required)' },
            { name: 'Staff Calls', description: 'Staff call intelligence' },
            { name: 'Agent Portal', description: 'Partner agent endpoints' },
            { name: 'External', description: 'External integration endpoints' },
            { name: 'Admin', description: 'Internal admin API' },
        ],
        paths: {
            '/auth/login': {
                post: {
                    tags: ['Auth'],
                    summary: 'Login with email and password',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['email', 'password'],
                                    properties: {
                                        email: { type: 'string', format: 'email' },
                                        password: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'JWT token pair' },
                        400: { description: 'Validation error' },
                        401: { description: 'Invalid credentials' },
                    },
                },
            },
            '/auth/register': {
                post: {
                    tags: ['Auth'],
                    summary: 'Register new agent (super_boss only)',
                    security: [{ BearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['name', 'email', 'password', 'role'],
                                    properties: {
                                        name: { type: 'string' },
                                        email: { type: 'string', format: 'email' },
                                        password: { type: 'string', minLength: 6 },
                                        role: { type: 'string', enum: ['super_boss', 'manager', 'employee'] },
                                        reports_to_id: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        201: { description: 'Agent created' },
                        400: { description: 'Validation error' },
                        401: { description: 'Unauthorized' },
                    },
                },
            },
            '/auth/me': {
                get: {
                    tags: ['Auth'],
                    summary: 'Get current user profile',
                    security: [{ BearerAuth: [] }],
                    responses: { 200: { description: 'User profile with permissions' } },
                },
            },
            '/public/properties': {
                get: {
                    tags: ['Public'],
                    summary: 'List properties with filters and pagination',
                    parameters: [
                        { name: 'location', in: 'query', schema: { type: 'string' } },
                        { name: 'intent', in: 'query', schema: { type: 'string' } },
                        { name: 'category_id', in: 'query', schema: { type: 'string' } },
                        { name: 'type_id', in: 'query', schema: { type: 'string' } },
                        { name: 'price_min', in: 'query', schema: { type: 'number' } },
                        { name: 'price_max', in: 'query', schema: { type: 'number' } },
                        { name: 'sort', in: 'query', schema: { type: 'string', enum: ['price_asc', 'price_desc', 'newest'] } },
                        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                        { name: 'limit', in: 'query', schema: { type: 'integer', default: 12 } },
                    ],
                    responses: { 200: { description: 'Paginated property list' } },
                },
            },
            '/public/properties/{id}': {
                get: {
                    tags: ['Public'],
                    summary: 'Get single property detail',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: {
                        200: { description: 'Property detail' },
                        404: { description: 'Not found' },
                    },
                },
            },
            '/public/featured-properties': {
                get: {
                    tags: ['Public'],
                    summary: 'Get featured property listings',
                    responses: { 200: { description: 'Featured properties' } },
                },
            },
            '/public/contact': {
                post: {
                    tags: ['Public'],
                    summary: 'Submit contact form (creates lead)',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['name', 'phone'],
                                    properties: {
                                        name: { type: 'string' },
                                        phone: { type: 'string' },
                                        email: { type: 'string' },
                                        message: { type: 'string' },
                                        property_id: { type: 'string' },
                                        intent: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    responses: { 201: { description: 'Lead captured' } },
                },
            },
            '/public/newsletter': {
                post: {
                    tags: ['Public'],
                    summary: 'Subscribe to newsletter',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['email'],
                                    properties: {
                                        email: { type: 'string', format: 'email' },
                                        name: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    responses: { 201: { description: 'Subscribed' } },
                },
            },
            '/public/post-property': {
                post: {
                    tags: ['Public'],
                    summary: 'Post a property listing',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['intent', 'location', 'price', 'phone'],
                                    properties: {
                                        intent: { type: 'string' },
                                        location: { type: 'string' },
                                        price: { type: 'number' },
                                        phone: { type: 'string' },
                                        category_id: { type: 'string' },
                                        type_id: { type: 'string' },
                                        specs: { type: 'object' },
                                        features: { type: 'object' },
                                        description: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    responses: { 201: { description: 'Property submitted' } },
                },
            },
            '/api/calls/upload': {
                post: {
                    tags: ['Staff Calls'],
                    summary: 'Upload call recording',
                    security: [{ BearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'multipart/form-data': {
                                schema: {
                                    type: 'object',
                                    required: ['audio', 'phone_number'],
                                    properties: {
                                        audio: { type: 'string', format: 'binary' },
                                        phone_number: { type: 'string' },
                                        classification: { type: 'string', enum: ['INBOUND', 'OUTBOUND'] },
                                        duration: { type: 'number' },
                                    },
                                },
                            },
                        },
                    },
                    responses: { 201: { description: 'Upload queued for processing' } },
                },
            },
            '/api/calls/{id}': {
                get: {
                    tags: ['Staff Calls'],
                    summary: 'Get call details and AI extraction',
                    security: [{ BearerAuth: [] }],
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 200: { description: 'Call details' } },
                },
            },
            '/api/calls/{id}/submit': {
                post: {
                    tags: ['Staff Calls'],
                    summary: 'Submit call to CRM (approve AI extraction)',
                    security: [{ BearerAuth: [] }],
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { 200: { description: 'Submitted to CRM' } },
                },
            },
            '/agent/login-otp': {
                post: {
                    tags: ['Agent Portal'],
                    summary: 'Request OTP for agent login',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['phone'],
                                    properties: { phone: { type: 'string' } },
                                },
                            },
                        },
                    },
                    responses: { 200: { description: 'OTP sent' } },
                },
            },
            '/agent/dashboard': {
                get: {
                    tags: ['Agent Portal'],
                    summary: 'Get agent dashboard data',
                    security: [{ AgentBearerAuth: [] }],
                    responses: { 200: { description: 'Dashboard stats' } },
                },
            },
            '/health': {
                get: {
                    tags: ['Admin'],
                    summary: 'Health check',
                    responses: {
                        200: { description: 'Service healthy' },
                        500: { description: 'Service unhealthy' },
                    },
                },
            },
        },
    },
    apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
