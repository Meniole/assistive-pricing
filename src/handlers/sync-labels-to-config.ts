import { COLORS, createLabel, listLabelsForRepo } from "../shared/label";
import { calculateLabelValue, calculateTaskPrice } from "../shared/pricing";
import { Context } from "../types/context";
import { COLLABORATOR_ONLY_DESCRIPTION } from "../types/plugin-input";

// This just checks all the labels in the config have been set in gh issue
// If there's something missing, they will be added

export async function syncPriceLabelsToConfig(context: Context): Promise<void> {
  const { config, logger } = context;

  const priceLabels: { name: string; collaboratorOnly: boolean }[] = [];
  for (const timeLabel of config.labels.time) {
    for (const priorityLabel of config.labels.priority) {
      const targetPrice = calculateTaskPrice(context, calculateLabelValue(timeLabel.name), calculateLabelValue(priorityLabel.name), config.basePriceMultiplier);
      const targetPriceLabel = `Price: ${targetPrice} USD`;
      priceLabels.push({ name: targetPriceLabel, collaboratorOnly: priorityLabel.collaboratorOnly });
    }
  }

  const pricingLabels = [...priceLabels, ...config.labels.time, ...config.labels.priority];

  // List all the labels for a repository
  const allLabels = await listLabelsForRepo(context);

  const incorrectPriceLabels = allLabels.filter(
    (label) =>
      label.name.startsWith("Price: ") &&
      !priceLabels.some((o) => o.name === label.name || (o.collaboratorOnly && label.description !== COLLABORATOR_ONLY_DESCRIPTION))
  );

  if (incorrectPriceLabels.length > 0 && config.globalConfigUpdate) {
    logger.info("Incorrect price labels found, removing them", { incorrectPriceLabels: incorrectPriceLabels.map((label) => label.name) });
    const owner = context.payload.repository.owner?.login;
    if (!owner) {
      throw logger.error("No owner found in the repository!");
    }
    await Promise.allSettled(
      incorrectPriceLabels.map((label) =>
        context.octokit.rest.issues.deleteLabel({
          owner,
          repo: context.payload.repository.name,
          name: label.name,
        })
      )
    );
    logger.info(`Removing incorrect price labels done`);
  }

  const incorrectColorPriceLabels = allLabels.filter((label) => label.name.startsWith("Price: ") && label.color !== COLORS.price);

  // Update incorrect color labels
  if (incorrectColorPriceLabels.length > 0) {
    logger.info("Incorrect color labels found, updating them", { incorrectColorPriceLabels: incorrectColorPriceLabels.map((label) => label.name) });
    const owner = context.payload.repository.owner?.login;
    if (!owner) {
      throw logger.error("No owner found in the repository!");
    }
    await Promise.allSettled(
      incorrectColorPriceLabels.map((label) =>
        context.octokit.rest.issues.updateLabel({
          owner,
          repo: context.payload.repository.name,
          name: label.name,
          color: COLORS.price,
        })
      )
    );
    logger.info(`Updating incorrect color labels done`);
  }

  // Get the missing labels
  const missingLabels = [...new Set(pricingLabels.filter((label) => !allLabels.map((i) => i.name).includes(label.name)))];

  // Create missing labels
  if (missingLabels.length > 0) {
    logger.info("Missing labels found, creating them", { missingLabels });
    await Promise.allSettled(
      missingLabels.map((label) => createLabel(context, label.name, "default", label.collaboratorOnly ? COLLABORATOR_ONLY_DESCRIPTION : undefined))
    );
    logger.info(`Creating missing labels done`);
  }
}
