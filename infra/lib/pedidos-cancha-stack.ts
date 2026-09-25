import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import * as path from 'path';

// Recursos de la instancia RDS existente (compartida con el proyecto "aula",
// pero usamos una base de datos propia -pedidos_cancha- dentro de ella).
const EXISTING_VPC_ID = 'vpc-094df1dd2d4dedde1';
const EXISTING_DB_SG_ID = 'sg-06e7140901c841def';
const EXISTING_DB_INSTANCE_ID = 'aula-dev-data-databaseb269d8bb-yosamgnfda8m';
const EXISTING_DB_ENDPOINT = 'aula-dev-data-databaseb269d8bb-yosamgnfda8m.c6z6usswkrab.us-east-1.rds.amazonaws.com';
const EXISTING_DB_PORT = 5432;

const APP_DB_NAME = 'pedidos_cancha';
const APP_DB_ROLE = 'pedidos_cancha_app';

// Secret creado manualmente por el usuario con las credenciales MASTER de la
// instancia (usuario "aula_app"), solo para que la migración pueda crear la
// base/rol nuevos. No lo crea este stack: no queremos que CDK gestione (ni
// pueda borrar) la contraseña maestra de una instancia compartida.
const MASTER_SECRET_NAME = 'pedidos-cancha/db-master-temp';

export class PedidosCanchaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'ExistingVpc', { vpcId: EXISTING_VPC_ID });

    const dbSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'ExistingDbSg', EXISTING_DB_SG_ID, {
      mutable: true,
    });

    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc,
      description: 'Lambdas de pedidos-cancha (migracion + API)',
      allowAllOutbound: true,
    });

    dbSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(EXISTING_DB_PORT),
      'Acceso desde Lambdas de pedidos-cancha'
    );

    // Credenciales de la app (bajo privilegio, generadas y rotables por CDK).
    // Las crea/gestiona este stack porque el rol pedidos_cancha_app es propio
    // de este proyecto, no compartido con "aula".
    const appSecret = new secretsmanager.Secret(this, 'AppDbSecret', {
      secretName: 'pedidos-cancha/db-app',
      description: `Credenciales del rol de aplicacion ${APP_DB_ROLE} en la base ${APP_DB_NAME}`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: APP_DB_ROLE }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    const masterSecret = secretsmanager.Secret.fromSecretNameV2(this, 'MasterDbSecret', MASTER_SECRET_NAME);

    const lambdaEnv = {
      DB_HOST: EXISTING_DB_ENDPOINT,
      DB_PORT: String(EXISTING_DB_PORT),
      DB_NAME: APP_DB_NAME,
      APP_DB_ROLE: APP_DB_ROLE,
      APP_SECRET_ARN: appSecret.secretArn,
    };

    const nodeJsBundling = {
      externalModules: [],
    };

    const migrateFn = new NodejsFunction(this, 'MigrateFn', {
      functionName: 'pedidos-cancha-migrate',
      entry: path.join(__dirname, '../lambda/migrate/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnv,
        MASTER_SECRET_ARN: masterSecret.secretArn,
      },
      bundling: {
        ...nodeJsBundling,
        commandHooks: {
          beforeBundling(): string[] {
            return [];
          },
          afterBundling(_inputDir: string, outputDir: string): string[] {
            const schemaPath = path.resolve(__dirname, '../../db/schema.sql');
            return [`cp "${schemaPath}" "${outputDir}"`];
          },
          beforeInstall(): string[] {
            return [];
          },
        },
      },
    });

    appSecret.grantRead(migrateFn);
    masterSecret.grantRead(migrateFn);

    new cdk.CfnOutput(this, 'MigrateFunctionName', { value: migrateFn.functionName });
    new cdk.CfnOutput(this, 'AppSecretArn', { value: appSecret.secretArn });
    new cdk.CfnOutput(this, 'DbEndpoint', { value: `${EXISTING_DB_ENDPOINT}:${EXISTING_DB_PORT}/${APP_DB_NAME}` });
  }
}
