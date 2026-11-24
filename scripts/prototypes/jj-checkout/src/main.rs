// Synchronize jj's workspace metadata with a tree Geordi already materialized.
// Only load the registered control repository. Never discover a repository or
// read configuration from the agent's checkout.
use jj_lib::{
    config::StackedConfig, default_backend_factories::default_backend_factories,
    local_working_copy::LocalWorkingCopy, object_id::ObjectId, repo::RepoLoader,
    settings::UserSettings, working_copy::WorkingCopy,
};
use std::{env, error::Error, path::Path};

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<_> = env::args().skip(1).collect();
    let [action, repo, checkout, name, expected] = args.as_slice() else {
        return Err(
            "expected action, control repository, checkout, workspace name and revision".into(),
        );
    };
    let settings = UserSettings::from_config(StackedConfig::with_defaults())?;
    let loader = RepoLoader::init_from_file_system(
        &settings,
        Path::new(repo),
        &default_backend_factories(),
    )?;
    let path = Path::new(checkout);
    let wc = LocalWorkingCopy::load(
        loader.store().clone(),
        path.to_owned(),
        path.join(".jj/working_copy"),
        &settings,
    )?;
    if wc.workspace_name().as_str() != name {
        return Err("unexpected jj workspace".into());
    }
    pollster::block_on(async {
        let mut locked = wc.start_mutation().await?;
        let heads = loader.op_heads_store().get_op_heads().await?;
        let [head] = heads.as_slice() else {
            return Err("concurrent jj operations; retry".into());
        };
        let op = loader.load_operation(head).await?;
        let view = op.view().await?;
        let id = view
            .get_wc_commit_id(wc.workspace_name())
            .ok_or("workspace has been forgotten")?;
        if id.hex() != *expected {
            return Err("workspace revision moved; retry".into());
        }
        match action.as_str() {
            "inspect" => {
                let old = loader
                    .load_operation(locked.old_operation_id())
                    .await?
                    .view()
                    .await?;
                println!(
                    "{}",
                    old.get_wc_commit_id(wc.workspace_name())
                        .ok_or("missing previous checkout")?
                        .hex()
                );
            }
            "ack" => {
                let commit = loader.store().get_commit_async(id).await?;
                // Unlike check_out(), reset() updates only the file-state cache.
                // Edits made since the snapshot stay on disk for the next jj status.
                locked.reset(&commit).await?;
                locked.finish(head.clone()).await?;
            }
            _ => return Err("unknown action".into()),
        }
        Ok(())
    })
}
