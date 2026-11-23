const fs = require("fs");
const path = require("path");

const {
  parseAwinFeedList,
  selectChangedAwinFeeds,
} = require("../integrations/awin");

const {
  createEmptyAwinFeedState,
  loadAwinFeedState,
  saveAwinFeedState,
  getLastImportedByFeedId,
  markAwinFeedProcessed,
} = require("../integrations/awinState");


function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(
      message
    );
  }
}


function main() {
  const testDir =
    path.join(
      __dirname,
      "awin-state-smoke"
    );

  const statePath =
    path.join(
      testDir,
      "state.json"
    );

  fs.rmSync(
    testDir,
    {
      recursive: true,
      force: true,
    }
  );

  try {
    const empty =
      loadAwinFeedState(
        statePath
      );

    assert(
      empty.schemaVersion ===
        1 &&
      Object.keys(
        empty.feeds
      ).length ===
        0,
      "State mancante deve partire vuoto"
    );


    const csv = [
      "Advertiser ID,Advertiser Name,Primary Region,Membership Status,Datafeed Format,Feed ID,Feed Name,Language,Vertical,Last Imported,Last Checked,No of products,URL",
      "1001,Unieuro,IT,active,Awin,5001,Default,Italian,Retail,2026-11-23 18:00:00,2026-11-23 18:05:00,1000,https://productdata.awin.com/datafeed/download/apikey/super-secret/id/5001",
    ].join(
      "\n"
    );

    const feed =
      parseAwinFeedList(
        csv
      )[0];

    const firstPlan =
      selectChangedAwinFeeds(
        [
          feed,
        ],
        {
          advertiserIds: [
            "1001",
          ],

          region:
            "IT",

          lastImportedByFeedId:
            getLastImportedByFeedId(
              empty
            ),
        }
      );

    assert(
      firstPlan
        .selected
        .length === 1,
      "Feed mai processato deve essere selezionato"
    );


    const processed =
      markAwinFeedProcessed(
        empty,
        feed,
        {
          processedAt:
            "2026-11-23T20:00:00Z",
        }
      );

    const saved =
      saveAwinFeedState(
        statePath,
        processed
      );

    assert(
      fs.existsSync(
        statePath
      ) &&
      saved.feeds
        .["5001"]
        .lastImported ===
        "2026-11-23 18:00:00",
      "State processato non salvato"
    );


    const reloaded =
      loadAwinFeedState(
        statePath
      );

    const secondPlan =
      selectChangedAwinFeeds(
        [
          feed,
        ],
        {
          advertiserIds: [
            "1001",
          ],

          region:
            "IT",

          lastImportedByFeedId:
            getLastImportedByFeedId(
              reloaded
            ),
        }
      );

    assert(
      secondPlan
        .selected
        .length === 0 &&
      secondPlan
        .skipped[0]
        .reasons
        .includes(
          "feed_not_changed"
        ),
      "Feed già processato non deve essere riscaricato"
    );


    const changedFeed = {
      ...feed,
      lastImported:
        "2026-11-23 21:00:00",
    };

    const thirdPlan =
      selectChangedAwinFeeds(
        [
          changedFeed,
        ],
        {
          advertiserIds: [
            "1001",
          ],

          region:
            "IT",

          lastImportedByFeedId:
            getLastImportedByFeedId(
              reloaded
            ),
        }
      );

    assert(
      thirdPlan
        .selected
        .length === 1,
      "Feed aggiornato deve tornare in coda"
    );


    const fresh =
      createEmptyAwinFeedState();

    assert(
      fresh.updatedAt ===
        null,
      "State nuovo non deve inventare updatedAt"
    );


    console.log(
      "✅ AWIN STATE — idempotenza feed planner"
    );
  } finally {
    fs.rmSync(
      testDir,
      {
        recursive: true,
        force: true,
      }
    );
  }
}


try {
  main();
} catch (error) {
  console.error(
    "❌ AWIN STATE",
    error.message
  );

  process.exitCode = 1;
}
