import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
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

// Secret existente del proyecto "aula" con las credenciales MASTER de la
// instancia (usuario "aula_app"), reusado solo para que la migración pueda
// crear la base/rol nuevos. No lo crea ni lo gestiona este stack: es del
// otro proyecto, solo lo leemos (GetSecretValue) durante la migración.
const MASTER_SECRET_NAME = 'aula/dev/db-credentials';

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

    // Lambda de GraphQL: recibe { query, variables } invocada directo por
    // Next.js via SDK (sin API Gateway ni Function URL, no queda expuesta
    // a internet).
    const graphqlFn = new NodejsFunction(this, 'GraphqlFn', {
      functionName: 'pedidos-cancha-graphql',
      entry: path.join(__dirname, '../lambda/graphql/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: lambdaEnv,
    });
    appSecret.grantRead(graphqlFn);

    // Rol que asume el compute SSR de Amplify Hosting (app "pedidos-cancha"
    // en us-east-2) para poder invocar este Lambda desde /api/graphql.
    // IAM es global, así que este rol se puede crear desde el stack en
    // us-east-1 aunque la app de Amplify viva en otra región.
    const amplifySsrRole = new iam.Role(this, 'AmplifySsrComputeRole', {
      roleName: 'pedidos-cancha-amplify-ssr',
      assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
      description: 'Compute role del SSR de Next.js en Amplify Hosting para invocar el Lambda GraphQL',
    });
    graphqlFn.grantInvoke(amplifySsrRole);

    new cdk.CfnOutput(this, 'MigrateFunctionName', { value: migrateFn.functionName });
    new cdk.CfnOutput(this, 'GraphqlFunctionName', { value: graphqlFn.functionName });
    new cdk.CfnOutput(this, 'GraphqlFunctionArn', { value: graphqlFn.functionArn });
    new cdk.CfnOutput(this, 'AmplifySsrComputeRoleArn', { value: amplifySsrRole.roleArn });
    new cdk.CfnOutput(this, 'AppSecretArn', { value: appSecret.secretArn });
    new cdk.CfnOutput(this, 'DbEndpoint', { value: `${EXISTING_DB_ENDPOINT}:${EXISTING_DB_PORT}/${APP_DB_NAME}` });

    // ── Bastion OpenVPN: acceso puntual a la RDS privada para debug/consultas.
    // Sin SSH: administracion via SSM Session Manager, y el .ovpn final se
    // publica en un secret que yo no puedo escribir directo (solo la propia
    // instancia, con su rol), para no manejar la clave privada del cliente
    // a mano en la conversacion.
    const vpnSecurityGroup = new ec2.SecurityGroup(this, 'VpnServerSg', {
      vpc,
      description: 'Bastion OpenVPN de pedidos-cancha',
      allowAllOutbound: true,
    });
    vpnSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(1194), 'OpenVPN clients');

    dbSecurityGroup.addIngressRule(
      vpnSecurityGroup,
      ec2.Port.tcp(EXISTING_DB_PORT),
      'Acceso desde el bastion OpenVPN de pedidos-cancha'
    );

    const vpnClientConfigSecret = new secretsmanager.Secret(this, 'VpnClientConfigSecret', {
      secretName: 'pedidos-cancha/vpn-client-config',
      description: 'Archivo .ovpn generado por el bastion para conectarse a la VPC de pedidos-cancha',
      secretStringValue: cdk.SecretValue.unsafePlainText('PENDING_SETUP'),
    });

    const vpnInstanceRole = new iam.Role(this, 'VpnInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')],
    });
    vpnClientConfigSecret.grantWrite(vpnInstanceRole);

    const vpnInstance = new ec2.Instance(this, 'VpnBastion', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: vpnSecurityGroup,
      role: vpnInstanceRole,
    });

    new cdk.CfnOutput(this, 'VpnInstanceId', { value: vpnInstance.instanceId });
    new cdk.CfnOutput(this, 'VpnPublicIp', { value: vpnInstance.instancePublicIp });
    new cdk.CfnOutput(this, 'VpnClientConfigSecretArn', { value: vpnClientConfigSecret.secretArn });
  }
}
