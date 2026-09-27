import * as vscode from "vscode";
import {
  INITIAL_STAR_STATE,
  recordSuccess,
  type StarState,
} from "../state/starPromptState";

export class FormattingFeedback {
  private queue: Promise<void> = Promise.resolve();
  private readonly status: vscode.StatusBarItem;
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly now = Date.now,
  ) {
    this.status = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      -100,
    );
    context.subscriptions.push(this.status);
  }
  show(message: string): void {
    this.status.text = `$(code) ${message}`;
    this.status.tooltip = "Plaintext Formatter";
    this.status.show();
  }
  success(message: string): void {
    this.queue = this.queue
      .then(async () => {
        const state = this.context.globalState.get<StarState>(
          "starState",
          INITIAL_STAR_STATE,
        );
        const next = recordSuccess(
          state,
          this.now(),
          vscode.workspace
            .getConfiguration("plaintextFormatter")
            .get("starPrompts", true),
        );
        await this.context.globalState.update("starState", next.state);
        this.show(message);
        if (next.message) {
          // Do not hold the counter queue while the user considers the notification.
          void vscode.window
            .showInformationMessage(next.message, "★ Star on GitHub")
            .then((action) => {
              if (action !== "★ Star on GitHub") return;
              this.queue = this.queue
                .then(async () => {
                  const latest = this.context.globalState.get<StarState>(
                    "starState",
                    next.state,
                  );
                  await this.context.globalState.update("starState", {
                    ...latest,
                    lastStarClickAt: this.now(),
                  });
                  await vscode.env.openExternal(
                    vscode.Uri.parse(
                      "https://github.com/iuripavani/plaintext-formatter",
                    ),
                  );
                })
                .catch(() => {
                  /* State/UI failure must never affect an edit. */
                });
            });
        }
      })
      .catch(() => {
        this.show(message);
      });
  }
}
