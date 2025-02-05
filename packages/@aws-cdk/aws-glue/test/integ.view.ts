#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as s3 from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';
import { Database, Schema, Table, OutputFormat, InputFormat, SerializationLibrary, View } from '../lib';
import { CfnTable } from '../lib/glue.generated';

/*
 * Stack verification steps:
 * * 1. Run a query on the created view, use the databucket below as output:
 * *  a. aws athena start-query-execution --query-string "SELECT * FROM mydatabase.combined_view" --result-configuration OutputLocation=s3://test-databucketd8691f4e-12wylrvb09hdt
 * *
 * * 2. Take the query execution id from the output and check for "State": "SUCCEEDED"
 * *  a. aws athena get-query-execution --query-execution-id a58df117-9837-4667-96a3-253687350c96
 */

const app = new cdk.App();

const stack = new cdk.Stack(app, 'aws-cdk-glue');

const database = new Database(stack, 'database', {
  databaseName: 'mydatabase',
});

const dataBucket = new s3.Bucket(stack, 'dataBucket');

const partitionKeys = [
  { name: 'year', type: Schema.STRING },
  { name: 'month', type: Schema.STRING },
  { name: 'day', type: Schema.STRING },
  { name: 'hour', type: Schema.STRING },
];

const sourceTable = new Table(stack, 'sourceTable', {
  columns: [
    { name: 'date', type: Schema.DATE },
    { name: 'time', type: Schema.STRING },
    { name: 'location', type: Schema.STRING },
    { name: 'bytes', type: Schema.BIG_INT },
    { name: 'request_ip', type: Schema.STRING },
    { name: 'method', type: Schema.STRING },
    { name: 'host', type: Schema.STRING },
    { name: 'uri', type: Schema.STRING },
    { name: 'status', type: Schema.INTEGER },
    { name: 'referrer', type: Schema.STRING },
    { name: 'user_agent', type: Schema.STRING },
    { name: 'query_string', type: Schema.STRING },
    { name: 'cookie', type: Schema.STRING },
    { name: 'result_type', type: Schema.STRING },
    { name: 'request_id', type: Schema.STRING },
    { name: 'host_header', type: Schema.STRING },
    { name: 'request_protocol', type: Schema.STRING },
    { name: 'request_bytes', type: Schema.BIG_INT },
    { name: 'time_taken', type: Schema.FLOAT },
    { name: 'xforwarded_for', type: Schema.STRING },
    { name: 'ssl_protocol', type: Schema.STRING },
    { name: 'ssl_cipher', type: Schema.STRING },
    { name: 'response_result_type', type: Schema.STRING },
    { name: 'http_version', type: Schema.STRING },
    { name: 'fle_status', type: Schema.STRING },
    { name: 'fle_encrypted_fields', type: Schema.INTEGER },
    { name: 'c_port', type: Schema.INTEGER },
    { name: 'time_to_first_byte', type: Schema.FLOAT },
    { name: 'x_edge_detailed_result_type', type: Schema.STRING },
    { name: 'sc_content_type', type: Schema.STRING },
    { name: 'sc_content_len', type: Schema.BIG_INT },
    { name: 'sc_range_start', type: Schema.BIG_INT },
    { name: 'sc_range_end', type: Schema.BIG_INT },
  ],
  partitionKeys: partitionKeys,
  database: database,
  tableName: 'partitioned_gz',
  description: 'Gzip logs delivered by Amazon CloudFront partitioned',
  s3Prefix: 'partitioned_gz',
  bucket: dataBucket,
  dataFormat: {
    outputFormat: OutputFormat.HIVE_IGNORE_KEY_TEXT,
    inputFormat: InputFormat.TEXT,
    serializationLibrary: SerializationLibrary.LAZY_SIMPLE,
  },
});

const sourceCfnTable = sourceTable.node.defaultChild as CfnTable;
sourceCfnTable.addOverride(
  'Properties.TableInput.Parameters.skip\\.header\\.line\\.count',
  '2',
);
sourceCfnTable.addOverride(
  'Properties.TableInput.StorageDescriptor.SerdeInfo.Parameters.field\\.delim',
  '\\t',
);
sourceCfnTable.addOverride(
  'Properties.TableInput.StorageDescriptor.SerdeInfo.Parameters.serialization\\.format',
  '\\t',
);

const targetTable = new Table(stack, 'targetTable', {
  columns: sourceTable.columns,
  partitionKeys: sourceTable.partitionKeys,
  database: database,
  tableName: 'partitioned_parquet',
  description: 'Gzip logs delivered by Amazon CloudFront partitioned',
  s3Prefix: 'partitioned_parquet',
  bucket: dataBucket,
  dataFormat: {
    outputFormat: OutputFormat.PARQUET,
    inputFormat: InputFormat.PARQUET,
    serializationLibrary: SerializationLibrary.PARQUET,
  },
});

const targetCfnTable = targetTable.node.defaultChild as CfnTable;
targetCfnTable.addOverride(
  'Properties.TableInput.Parameters.parquet\\.compression',
  'snappy',
);

new View(stack, 'combinedView', {
  columns: sourceTable.columns.concat(partitionKeys, {
    name: 'file',
    type: Schema.STRING,
  }),
  database: database,
  tableName: 'combined_view',
  description: 'Gzip logs delivered by Amazon CloudFront partitioned',
  statement: fs
    .readFileSync(path.join(__dirname, 'combinedView.sql'))
    .toString(),
  placeHolders: {
    sourceTable: sourceTable.tableName,
    targetTable: targetTable.tableName,
  },
});

app.synth();
