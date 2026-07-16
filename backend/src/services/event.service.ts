import { ProjectEvent, IProjectEvent } from "../models/projectEvent.model";

export class EventService {
  /**
   * Persists an immutable audit/activity event for a project workspace.
   *
   * @param projectId The unique project UUID identifier.
   * @param eventType The type of workspace change that occurred.
   * @param payload Accompanying metadata and changes.
   * @param actorId The user.uuid.id of the actor performing the operation.
   */
  public static async recordEvent(
    projectId: string,
    eventType: IProjectEvent["eventType"],
    payload: Record<string, any>,
    actorId: string
  ): Promise<IProjectEvent> {
    const event = new ProjectEvent({
      projectId,
      eventType,
      payload,
      actorId,
    });
    return await event.save();
  }
}
