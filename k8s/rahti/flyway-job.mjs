import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const migrationsDir = path.join(rootDir, 'db', 'migrations');

const [operation, jobName] = process.argv.slice(2);
const namespace = process.env.RAHTI_NAMESPACE;

if (!['info', 'validate', 'validate-pending', 'migrate'].includes(operation)) {
    throw new Error(
        'Operation must be info, validate, validate-pending, or migrate'
    );
}

if (!namespace || namespace !== 'rio-theaters-dev') {
    throw new Error('Expected RAHTI_NAMESPACE=rio-theaters-dev');
}

if (
    !jobName ||
    !/^rio-flyway-[a-z0-9-]+$/.test(jobName) ||
    jobName.length > 63
) {
    throw new Error('Invalid Flyway Job name');
}

if (
    operation === 'migrate' &&
    process.env.ALLOW_RAHTI_MIGRATIONS !== 'true'
) {
    throw new Error(
        'Rahti migrations are disabled until backup safeguards are configured'
    );
}

const entries = readdirSync(migrationsDir, {
    withFileTypes: true
});

if (entries.some(entry => !entry.isFile())) {
    throw new Error('The migrations directory must contain only files');
}

const migrationNames = entries
    .map(entry => entry.name)
    .sort();

if (
    migrationNames.length === 0 ||
    migrationNames.some(
        name => !/^V[0-9]{3,}__[a-z][a-z0-9_]*\.sql$/.test(name)
    )
) {
    throw new Error('Invalid database migration files');
}

const migrations = Object.fromEntries(
    migrationNames.map(name => [
        name,
        readFileSync(path.join(migrationsDir, name), 'utf8')
    ])
);

const hash = createHash('sha256')
    .update(JSON.stringify(migrations))
    .digest('hex')
    .slice(0, 16);

const configMapName = `rio-flyway-migrations-${hash}`;

const configMap = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
        name: configMapName,
        namespace
    },
    immutable: true,
    data: migrations
};

const flywayArgs = [
    '-locations=filesystem:/flyway/sql',
    '-defaultSchema=public',
    '-schemas=public',
    '-baselineOnMigrate=false',
    '-cleanDisabled=true',
    '-validateMigrationNaming=true',
    '-outOfOrder=false',
    '-group=true',
    '-executeInTransaction=true',
    '-mixed=false',
    '-connectRetries=10',
    ...(operation === 'validate-pending'
        ? ['-ignoreMigrationPatterns=*:pending']
        : ['-ignoreMigrationPatterns=']),
    operation === 'validate-pending' ? 'validate' : operation
];

const job = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
        name: jobName,
        namespace
    },
    spec: {
        backoffLimit: 0,
        activeDeadlineSeconds: 300,
        template: {
            spec: {
                restartPolicy: 'Never',
                containers: [
                    {
                        name: 'flyway',
                        image: 'docker.io/flyway/flyway:13.12.1',
                        imagePullPolicy: 'IfNotPresent',
                        command: ['/flyway/flyway'],
                        args: flywayArgs,
                        env: [
                            {
                                name: 'FLYWAY_URL',
                                value:
                                    'jdbc:postgresql://postgres:5432/rio_theaters' +
                                    '?options=-c%20lock_timeout%3D5000' +
                                    '%20-c%20statement_timeout%3D120000'
                            },
                            {
                                name: 'FLYWAY_USER',
                                valueFrom: {
                                    secretKeyRef: {
                                        name: 'rio-postgres',
                                        key: 'POSTGRESQL_USER'
                                    }
                                }
                            },
                            {
                                name: 'FLYWAY_PASSWORD',
                                valueFrom: {
                                    secretKeyRef: {
                                        name: 'rio-postgres',
                                        key: 'POSTGRESQL_PASSWORD'
                                    }
                                }
                            },
                            {
                                name: 'HOME',
                                value: '/tmp'
                            }
                        ],
                        volumeMounts: [
                            {
                                name: 'migrations',
                                mountPath: '/flyway/sql',
                                readOnly: true
                            }
                        ],
                        resources: {
                            requests: {
                                cpu: '50m',
                                memory: '128Mi'
                            },
                            limits: {
                                cpu: '200m',
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
                                type: 'Localhost',
                                localhostProfile: 'rahti-custom-seccomp.json'
                            }
                        }
                    }
                ],
                volumes: [
                    {
                        name: 'migrations',
                        configMap: {
                            name: configMapName
                        }
                    }
                ]
            }
        }
    }
};

process.stdout.write(
    JSON.stringify({
        apiVersion: 'v1',
        kind: 'List',
        items: [configMap, job]
    }, null, 2)
);