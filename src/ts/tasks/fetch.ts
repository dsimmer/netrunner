/* eslint-disable no-console */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fetchData, FetchOptions } from "./nrdb";

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function usage(): string {
  return [
    "",
    "Usage: fetch [options]",
    "",
    "Options:",
    "  -l, --local PATH        Path to fetch card edn from",
    "  -r, --repo REPO         GitHub name/repo (default: NoahTheDuke/netrunner-data)",
    "  -b, --branch BRANCH     Branch to pull from (default: master)",
    "  -d, --db                Load card data into the database (default: true)",
    "  -n, --no-db             Do not load edn data into the database",
    "  -i, --card-images       Fetch card images (default: true)",
    "  -j, --no-card-images    Do not fetch card images",
  ].join("\n");
}

function exit(status: number, msg: string): never {
  process.stderr.write(msg + "\n");
  process.exit(status);
}

// ---------------------------------------------------------------------------
// Arg parser (mirrors clojure.tools.cli parse-opts for these options)
// ---------------------------------------------------------------------------

interface ParseResult {
  options: FetchOptions;
  errors: string[];
  extraArgs: string[];
}

function parseArgs(args: string[]): ParseResult {
  const options: FetchOptions = {
    repo: "NoahTheDuke/netrunner-data",
    branch: "master",
    db: true,
    cardImages: true,
  };
  const errors: string[] = [];
  const extraArgs: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case "-l":
      case "--local": {
        const path = args[++i];
        if (!path) {
          errors.push("--local requires a PATH argument");
        } else if (!existsSync(join(path, "edn", "raw_data.edn"))) {
          errors.push(
            `Could not find local data file at ${path}/edn/raw_data.edn`,
          );
        } else {
          options.local = path;
        }
        break;
      }
      case "-r":
      case "--repo": {
        const repo = args[++i];
        if (!repo) {
          errors.push("--repo requires a REPO argument");
        } else {
          options.repo = repo;
        }
        break;
      }
      case "-b":
      case "--branch": {
        const branch = args[++i];
        if (!branch) {
          errors.push("--branch requires a BRANCH argument");
        } else {
          options.branch = branch;
        }
        break;
      }
      case "-d":
      case "--db":
        options.db = true;
        break;
      case "-n":
      case "--no-db":
        options.db = false;
        break;
      case "-i":
      case "--card-images":
        options.cardImages = true;
        break;
      case "-j":
      case "--no-card-images":
        options.cardImages = false;
        break;
      default:
        if (arg.startsWith("-")) {
          errors.push(`Unknown option: ${arg}`);
        } else {
          extraArgs.push(arg);
        }
    }
    i++;
  }

  return { options, errors, extraArgs };
}

// ---------------------------------------------------------------------------
// command – mirrors tasks.fetch/command
// ---------------------------------------------------------------------------

export async function command(...args: string[]): Promise<void> {
  const { options, errors, extraArgs } = parseArgs(args);

  if (errors.length > 0 || extraArgs.length > 0) {
    const allErrors = [...errors];
    if (extraArgs.length > 0) {
      allErrors.push(`Unexpected arguments: ${extraArgs.join(", ")}`);
    }
    exit(1, allErrors.join("\n") + "\n" + usage());
  }

  await fetchData(options);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await command(...process.argv.slice(2));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
