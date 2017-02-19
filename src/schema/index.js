import { EventsSchema } from './events';
import { ThingSchema } from './things';
const rootSchema = [`
type Query {
  getThings(
  limit: Int
  ): [Thing]
  getEvents(
  limit: Int
  ): [Event]
  getThing(
    uuid: String!
  ): [Thing]
  getEvent(
    _id: String!
  ): [Event]

}
schema {
  query: Query
}
`];

const schema = [...rootSchema, ...EventsSchema, ...ThingSchema];
export default schema;
