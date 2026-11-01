import { PartialType } from '@nestjs/swagger';
import { CreateEventDto } from './create-event.dto';

/** PATCH semantics: every field optional. `description` accepts null to clear it. */
export class UpdateEventDto extends PartialType(CreateEventDto) {}
