'use strict';

import * as core from '@actions/core';
import * as github from '@actions/github';
import { PullsListReviewsResponseData, ChecksCreateResponseData } from '@octokit/types/dist-types/generated/Endpoints.d';
import { OctokitResponse } from '@octokit/types/dist-types/OctokitResponse.d';
import { Context } from '@actions/github/lib/context';
import { GitHub } from '@actions/github/lib/utils';
import 'lodash/partition';
import yaml from 'yaml';
import { Config, ConfigGroup } from './config';


async function fetch_config(): Promise<Config> {
  const context = get_context();
  const octokit = get_octokit();
  const config_path = get_config_path();

  const { data: response_body } = await octokit.repos.getContent({
    owner: context.repo.owner,
    repo: context.repo.repo,
    path: config_path,
    ref: context.ref,
  });

  var ymlContent = Buffer.from(response_body.content, 'base64').toString();

  return yaml.parse(ymlContent);
}


async function fetch_changed_files(): Promise<string[]> {
  const context = get_context();

  if (!context.payload.pull_request) {
    throw 'No pull request found.';
  }
  const octokit = get_octokit();

  const changed_files: string[] = [];

  const per_page = 100;

  let page = 0;

  let number_of_files_in_current_page: number;

  do {
    page += 1;

    const { data: response_body } = await octokit.pulls.listFiles({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
      page,
      per_page,
    });

    number_of_files_in_current_page = response_body.length;

    changed_files.push(...response_body.map((file) => file.filename));

  } while (number_of_files_in_current_page === per_page);

  return changed_files;
}

const groupMap: { [group: string]: OctokitResponse<ChecksCreateResponseData> } = {};

async function addCheckRun(groupName: string) {
  const octokit = get_octokit();

  const context = get_context();

  core.info(`Creating check run ${groupName}`)
  groupMap[groupName] = await octokit.checks.create({
    head_sha: context.sha,
    name: groupName,
    status: 'in_progress',
    output: {
      title: groupName,
      summary: ''
    },
    ...github.context.repo
  });
  
}

async function updateCheckRun(groupName: string, conclusion: 'success' | 'failure') {
  const octokit = get_octokit();

  const context = get_context();

  const initCheck = groupMap[groupName];
  
  const resp = await octokit.checks.update({
    check_run_id: initCheck.data.id,
    conclusion: conclusion,
    status: 'completed',
    output: {
      title: `${groupName} Approvals.`,
      summary: `${groupName} Approvals.`,
      text: `${groupName} Approvals.`
    },
    ...github.context.repo
  })
  core.info(`Check run create response: ${resp.status}`)
  core.info(`Check run URL: ${resp.data.url}`)
  core.info(`Check run HTML: ${resp.data.html_url}`)
}


async function get_reviews(): Promise<PullsListReviewsResponseData> {
  const octokit = get_octokit();

  const context = get_context();

  if (!context.payload.pull_request) {
    throw 'No pull request found.';
  }

  const result: PullsListReviewsResponseData = [];

  const per_page = 100;

  let page = 0;

  let number_of_files_in_current_page: number;

  do {
    page += 1;

    const reviewsResult = await octokit.pulls.listReviews({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
      page: page,
      per_page: per_page
    });

    number_of_files_in_current_page = reviewsResult.data.length;

    result.push(...reviewsResult.data);

  } while (number_of_files_in_current_page === per_page);

  return result;
}


let cacheContext: Context | null = null;
let cacheToken: string | null = null;
let cacheConfigPath: string | null = null; 
let cacheOctoKit: InstanceType<typeof GitHub> | null = null;

let get_context: () => Context = () => cacheContext || (cacheContext = github.context);

let get_token: () => string = () => cacheToken || (cacheToken =core.getInput('token'));

let get_config_path:() => string = () => cacheConfigPath || (cacheConfigPath = core.getInput('config'));

let get_octokit:() => InstanceType<typeof GitHub> = () => cacheOctoKit || (cacheOctoKit = github.getOctokit(get_token()));

export default {
  fetch_config,
  get_reviews,
  fetch_changed_files,
  addCheckRun,
  updateCheckRun
};
