import { Context } from "../types/context";
import { Label } from "../types/github";

// cspell:disable
const COLORS = { default: "ededed", price: "1f883d" };
// cspell:enable

export async function listLabelsForRepo(context: Context): Promise<Label[]> {
  const payload = context.payload;

  const owner = payload.repository.owner?.login;
  if (!owner) {
    throw context.logger.error("No owner found in the repository!");
  }

  const res = await context.octokit.rest.issues.listLabelsForRepo({
    owner,
    repo: payload.repository.name,
    per_page: 100,
    page: 1,
  });

  if (res.status === 200) {
    return res.data;
  }

  throw context.logger.error("Failed to fetch lists of labels", { status: res.status });
}
export async function createLabel(context: Context, name: string, labelType = "default" as keyof typeof COLORS): Promise<void> {
  const payload = context.payload;

  const color = name.startsWith("Price: ") ? COLORS.price : COLORS[labelType];
  const owner = payload.repository.owner?.login;
  if (!owner) {
    throw context.logger.error("No owner found in the repository!");
  }

  await context.octokit.rest.issues.createLabel({
    owner,
    repo: payload.repository.name,
    name,
    color,
  });
}

export async function clearAllPriceLabelsOnIssue(context: Context) {
  const payload = context.payload;
  if (!("issue" in payload) || !payload.issue) {
    return;
  }

  const labels = payload.issue.labels;
  if (!labels) return;
  const issuePriceLabels = labels.filter((label) => label.name.toString().startsWith("Price: "));
  if (!issuePriceLabels.length) return;

  for (const label of issuePriceLabels) {
    try {
      await context.octokit.issues.removeLabel({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.issue.number,
        name: label.name,
      });
    } catch (err: unknown) {
      context.logger.error("Clearing all price labels failed!", { err });
    }
  }
}
export async function addLabelToIssue(context: Context, labelName: string) {
  const payload = context.payload;
  if (!("issue" in payload) || !payload.issue) {
    return;
  }

  try {
    await context.octokit.issues.addLabels({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.issue.number,
      labels: [labelName],
    });

    // Update color if it's a price label
    if (labelName.startsWith("Price: ")) {
      await updateLabelColor(context, labelName, COLORS.price);
    }
  } catch (err: unknown) {
    context.logger.error("Adding a label to issue failed!", { err });
  }
}

export async function removeLabelFromIssue(context: Context, labelName: string) {
  const payload = context.payload;
  if (!("issue" in payload) || !payload.issue) {
    return;
  }

  try {
    await context.octokit.issues.removeLabel({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.issue.number,
      name: labelName,
    });
  } catch (err: unknown) {
    context.logger.error("Adding a label to issue failed!", { err });
  }
}

async function updateLabelColor(context: Context, labelName: string, color: string) {
  const payload = context.payload;
  const owner = payload.repository.owner?.login;

  if (!owner) {
    throw context.logger.error("No owner found in the repository!");
  }

  const issueLAbels = await listLabelsForRepo(context);
  const label = issueLAbels.find((label) => label.name === labelName);

  if (!label) {
    throw context.logger.error("Label not found!", { labelName });
  }

  if (label.color === color) return;

  try {
    await context.octokit.rest.issues.updateLabel({
      owner,
      repo: payload.repository.name,
      name: label.name,
      new_name: labelName,
      color,
    });
  } catch (err: unknown) {
    context.logger.error("Updating label color failed!", { err });
  }
}
