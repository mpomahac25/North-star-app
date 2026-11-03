import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const envPath = path.join(rootDir, '.env');

// Load local environment configuration
if (existsSync(envPath)) {
    loadEnvFile(envPath);
}

// Docker Hub namespace used when constructing image names
const namespace = process.env.DOCKERHUB_USERNAME;

if (!namespace) {
    throw new Error('DOCKERHUB_USERNAME is not configured');
}

// Application component configuration
const components = [
    {
        name: 'frontend',
        directory: 'frontend',
        portVariable: 'FRONTEND_PORT',
        defaultPort: 3000
    },
    {
        name: 'backend',
        directory: 'backend',
        portVariable: 'BACKEND_PORT',
        defaultPort: 3001
    },
    {
        name: 'booking',
        directory: 'services/booking',
        portVariable: 'BOOKING_PORT',
        defaultPort: 3002
    },
    {
        name: 'login',
        directory: 'services/login',
        portVariable: 'LOGIN_PORT',
        defaultPort: 3003
    },
    {
        name: 'payment',
        directory: 'services/payment',
        portVariable: 'PAYMENT_PORT',
        defaultPort: 3004
    },
    {
        name: 'movies',
        directory: 'services/movies',
        portVariable: 'MOVIES_API_PORT',
        defaultPort: 3005
    }
];

// Resolve each component's internal port
function getPort(component) {
    const port = Number(
        process.env[component.portVariable] ?? component.defaultPort
    );

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(
            `Invalid port for ${component.name}: ${port}`
        );
    }

    return port;
}

// Read and validate the component's VERSION file
function getVersion(component) {
    const versionPath = path.join(
        rootDir,
        component.directory,
        'VERSION'
    );

    const version = readFileSync(versionPath, 'utf8').trim();

    if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) {
        throw new Error(
            `Invalid version in ${versionPath}: ${version}`
        );
    }

    return version;
}

// Generate a Kubernetes Deployment for one application component
function createDeployment(component) {
    const port = getPort(component);
    const version = getVersion(component);

    const environment = {
        [component.portVariable]: String(port)
    };

    // Configure frontend communication with the internal backend Service
    if (component.name === 'frontend') {
        const backend = components.find(
            item => item.name === 'backend'
        );

        environment.BACKEND_URL = `http://backend:${getPort(backend)}`;
    }

    return {
        apiVersion: 'apps/v1',
        kind: 'Deployment',

        metadata: {
            name: component.name
        },

        spec: {
            replicas: 1,

            selector: {
                matchLabels: {
                    app: component.name
                }
            },

            template: {
                metadata: {
                    labels: {
                        app: component.name
                    }
                },

                spec: {
                    containers: [
                        {
                            name: component.name,

                            image:
                                `docker.io/${namespace}/rio-theaters-${component.name}:${version}`,

                            imagePullPolicy: 'IfNotPresent',

                            ports: [
                                {
                                    name: 'http',
                                    containerPort: port
                                }
                            ],

                            env: Object.entries(environment).map(
                                ([name, value]) => ({
                                    name,
                                    value
                                })
                            ),

                            livenessProbe: {
                                httpGet: {
                                    path: '/api/live',
                                    port: 'http'
                                },
                                initialDelaySeconds: 10,
                                periodSeconds: 10,
                                timeoutSeconds: 3
                            },

                            readinessProbe: {
                                httpGet: {
                                    path: '/api/health',
                                    port: 'http'
                                },
                                initialDelaySeconds: 5,
                                periodSeconds: 10,
                                timeoutSeconds: 3
                            },

                            resources: {
                                requests: {
                                    cpu: '100m',
                                    memory: '128Mi'
                                },
                                limits: {
                                    cpu: '400m',
                                    memory: '512Mi'
                                }
                            },

                            securityContext: {
                                allowPrivilegeEscalation: false,
                                capabilities: {
                                    drop: ['ALL']
                                },
                                runAsNonRoot: true,
                                seccompProfile: {
                                    type: 'RuntimeDefault'
                                }
                            }
                        }
                    ]
                }
            }
        }
    };
}

// Generate an internal Kubernetes Service for one application component
function createService(component) {
    return {
        apiVersion: 'v1',
        kind: 'Service',

        metadata: {
            name: component.name
        },

        spec: {
            type: 'ClusterIP',

            selector: {
                app: component.name
            },

            ports: [
                {
                    name: 'http',
                    port: getPort(component),
                    targetPort: 'http'
                }
            ]
        }
    };
}

// Combine all Deployments and Services into one manifest
const manifests = {
    apiVersion: 'v1',
    kind: 'List',

    items: components.flatMap(component => [
        createDeployment(component),
        createService(component)
    ])
};

const manifestJson = JSON.stringify(manifests, null, 2);

// Print the generated configuration without deploying
if (process.argv.includes('--print')) {
    process.stdout.write(manifestJson);
}
else {
    // Apply the generated resources to the currently selected Rahti project
    const result = spawnSync(
        'oc',
        ['apply', '-f', '-'],
        {
            cwd: rootDir,
            input: manifestJson,
            encoding: 'utf8',
            stdio: ['pipe', 'inherit', 'inherit']
        }
    );

    if (result.error) {
        throw result.error;
    }

    process.exitCode = result.status ?? 1;
}