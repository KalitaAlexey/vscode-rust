import { ExtensionContext, window } from 'vscode';
import { Configuration } from '../configuration/Configuration';
import { CurrentWorkingDirectoryManager }
    from '../configuration/current_working_directory_manager';
import { ChildLogger } from '../logging/child_logger';
import { CommandInvocationReason } from './CommandInvocationReason';
import { CrateType } from './CrateType';
import { CommandStartHandleResult, Helper } from './helper';
import { OutputChannelTaskManager } from './output_channel_task_manager';
import { TerminalTaskManager } from './terminal_task_manager';
import { UserDefinedArgs } from './UserDefinedArgs';

export class CargoTaskManager {
    private _configuration: Configuration;
    private _currentWorkingDirectoryManager: CurrentWorkingDirectoryManager;
    private _logger: ChildLogger;
    private _outputChannelTaskManager: OutputChannelTaskManager;
    private _terminalTaskManager: TerminalTaskManager;

    public constructor(
        context: ExtensionContext,
        configuration: Configuration,
        currentWorkingDirectoryManager: CurrentWorkingDirectoryManager,
        logger: ChildLogger,
        stopCommandName: string
    ) {
        this._configuration = configuration;
        this._currentWorkingDirectoryManager = currentWorkingDirectoryManager;
        this._logger = logger;
        this._outputChannelTaskManager = new OutputChannelTaskManager(
            configuration,
            logger.createChildLogger('OutputChannelTaskManager: '),
            stopCommandName
        );
        this._terminalTaskManager = new TerminalTaskManager(context, configuration);
    }

    public async invokeCargoInit(crateType: CrateType, name: string, cwd: string): Promise<void> {
        const args = ['--name', name];
        switch (crateType) {
            case CrateType.Application:
                args.push('--bin');
                break;
            case CrateType.Library:
                args.push('--lib');
                break;
            default:
                throw new Error(`Unhandled crate type=${crateType}`);
        }
        this._outputChannelTaskManager.startTask('init', args, cwd, false, true);
    }

    public invokeCargoBuildWithArgs(args: string[], reason: CommandInvocationReason): void {
        this.runCargo('build', args, true, reason);
    }

    public invokeCargoBuildUsingBuildArgs(reason: CommandInvocationReason): void {
        this.invokeCargoBuildWithArgs(UserDefinedArgs.getBuildArgs(), reason);
    }

    public invokeCargoCheckWithArgs(args: string[], reason: CommandInvocationReason): void {
        this.runCargo('check', args, true, reason);
    }

    public invokeCargoCheckUsingCheckArgs(reason: CommandInvocationReason): void {
        this.invokeCargoCheckWithArgs(UserDefinedArgs.getCheckArgs(), reason);
    }

    public invokeCargoClippyWithArgs(args: string[], reason: CommandInvocationReason): void {
        this.runCargo('clippy', args, true, reason);
    }

    public invokeCargoClippyUsingClippyArgs(reason: CommandInvocationReason): void {
        this.invokeCargoClippyWithArgs(UserDefinedArgs.getClippyArgs(), reason);
    }

    public invokeCargoDocWithArgs(args: string[], reason: CommandInvocationReason): void {
        this.runCargo('doc', args, true, reason);
    }

    public invokeCargoDocUsingDocArgs(reason: CommandInvocationReason): void {
        this.invokeCargoDocWithArgs(UserDefinedArgs.getDocArgs(), reason);
    }

    public async invokeCargoNew(projectName: string, isBin: boolean, cwd: string): Promise<void> {
        const args = [projectName, isBin ? '--bin' : '--lib'];
        await this._outputChannelTaskManager.startTask('new', args, cwd, false, true);
    }

    public invokeCargoRunWithArgs(args: string[], reason: CommandInvocationReason): void {
        this.runCargo('run', args, true, reason);
    }

    public invokeCargoRunUsingRunArgs(reason: CommandInvocationReason): void {
        this.invokeCargoRunWithArgs(UserDefinedArgs.getRunArgs(), reason);
    }

    public invokeCargoTestWithArgs(args: string[], reason: CommandInvocationReason): void {
        this.runCargo('test', args, true, reason);
    }

    public invokeCargoTestUsingTestArgs(reason: CommandInvocationReason): void {
        this.invokeCargoTestWithArgs(UserDefinedArgs.getTestArgs(), reason);
    }

    public invokeCargo(command: string, args: string[]): void {
        this.runCargo(command, args, true, CommandInvocationReason.CommandExecution);
    }

    public stopTask(): void {
        if (this._outputChannelTaskManager.hasRunningTask()) {
            this._outputChannelTaskManager.stopRunningTask();
        }
    }

    private async runCargo(command: string, args: string[], force: boolean, reason: CommandInvocationReason): Promise<void> {
        let cwd: string;
        try {
            cwd = await this._currentWorkingDirectoryManager.cwd();
        } catch (error) {
            window.showErrorMessage(error.message);
            return;
        }
        if (this._configuration.shouldExecuteCargoCommandInTerminal()) {
            this._terminalTaskManager.execute(command, args, cwd);
        } else {
            if (this._outputChannelTaskManager.hasRunningTask()) {
                if (!force) {
                    return;
                }
                const helper = new Helper(this._configuration);
                const result = await helper.handleCommandStartWhenThereIsRunningCommand();
                switch (result) {
                    case CommandStartHandleResult.IgnoreNewCommand:
                        return;
                    case CommandStartHandleResult.StopRunningCommand:
                        await this._outputChannelTaskManager.stopRunningTask();
                }
            }
            // The output channel should be shown only if the user wants that.
            // The only exception is checking invoked on saving the active document - in that case the output channel shouldn't be shown.
            const shouldShowOutputChannel: boolean =
                this._configuration.shouldShowRunningCargoTaskOutputChannel() &&
                !(command === 'check' && reason === CommandInvocationReason.ActionOnSave);
            await this._outputChannelTaskManager.startTask(command, args, cwd, true, shouldShowOutputChannel);
        }
    }
}