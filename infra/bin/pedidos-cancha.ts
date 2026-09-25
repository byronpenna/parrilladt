#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PedidosCanchaStack } from '../lib/pedidos-cancha-stack';

const app = new cdk.App();

new PedidosCanchaStack(app, 'PedidosCanchaStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
