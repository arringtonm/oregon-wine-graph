import type { EdgeType, GraphEdge } from './schema'
import roleTitles from './role-titles.json'

// How a connection's role reads on a record's card. For connection types where the role
// says what the person or place is ("co-owner", "head winemaker", "founding member"), a
// short title stands in for the verb: "Mark Wisnovsky (co-owner, from 2005)" rather than
// "(owned by: co-owner, from 2005)". Roles of four words or more are condensed to a title
// from role-titles.json, chosen from the vocabulary below (tools/roles/titles.ts), which also
// tidies short roles that don't read as titles ("winemaking" becomes "winemaker"); the full
// role still shows where the connection is checked (the verification note, admin mode).

// Connection types whose role is a title for one side of it
export const TITLE_TYPES = new Set<EdgeType>(['founded', 'owns', 'worked_at', 'winemaker', 'consulted', 'member_of', 'mentored'])

// Short enough to stand as it is
export const SHORT_ROLE_WORDS = 3

// The titles each type's long roles are condensed to, with what each means (Jev reads these)
export const TITLE_VOCABULARY: Partial<Record<EdgeType, Record<string, string>>> = {
  founded: {
    founder: 'Founded it alone or as the main founder',
    'co-founder': 'One of several founders',
    'founding partner': 'A partner or investor at the founding',
    'founding winemaker': 'Made the wine when it was founded',
    planted: 'Planted the vineyard or its first vines',
    organizer: 'One of the people who organized or started an event or group',
  },
  owns: {
    owner: 'Owns it',
    'co-owner': 'Owns it with others',
    'family owner': 'Owned by the family; a family member who owns it',
    proprietor: 'Proprietor or owner-operator',
    'owner-winemaker': 'Owns it and makes the wine',
    'second generation': 'Took over from the founding generation',
    partner: 'A business partner',
    investor: 'Invested in it',
    'estate vineyard': 'A vineyard the winery owns and farms for its own wine',
  },
  worked_at: {
    winemaker: 'Made the wine',
    'assistant winemaker': 'Assistant, associate or cellar-level winemaker',
    'cellar worker': 'Cellar hand, cellar master or cellar associate',
    'vineyard manager': 'Managed or farmed the vineyard',
    'vineyard crew': 'Worked in the vineyard',
    'general manager': 'General manager or managing director',
    operator: 'Runs or operates the business, often with family',
    president: 'President, CEO or other head of the organization',
    executive: 'A senior executive: vice president, director of a department',
    'sales and marketing': 'Sales, marketing or distribution',
    hospitality: 'Tasting room, events or hospitality',
    intern: 'Intern or harvest worker for a season',
    professor: 'Taught as a professor, instructor or lecturer',
    researcher: 'Research scientist or extension specialist',
    staff: 'Worked there in another or unspecified role',
  },
  winemaker: {
    winemaker: 'The winemaker',
    'head winemaker': 'Head or lead winemaker',
    'founding winemaker': 'The first winemaker',
    'co-winemaker': 'One of several winemakers working together',
    'winemaker and manager': 'Made the wine and also managed the business or vineyard',
    'guest winemaker': 'Made a particular wine or vintage as a guest',
  },
  consulted: {
    'consulting winemaker': 'Consulted on winemaking',
    'vineyard consultant': 'Consulted on the vineyard or viticulture',
    consultant: 'Consulted on something else',
  },
  member_of: {
    member: 'A member',
    'founding member': 'A member from the founding',
    'board member': 'On the board',
    director: 'A director or officer',
    president: 'President or chair',
    'certified member': 'A certified member',
  },
  mentored: {
    mentor: 'Mentored or trained them',
  },
}

const TITLES = roleTitles as Record<string, string>

export const titleKey = (type: EdgeType, role: string) => `${type}|${role}`

// The short title a connection shows in place of its verb, or undefined to keep the verb
// An agreed title comes first: it also tidies short roles that aren't titles ("winemaking",
// "with William Meek")
export function roleTitle(edge: Pick<GraphEdge, 'type' | 'role'>): string | undefined {
  if (!edge.role || !TITLE_TYPES.has(edge.type)) return undefined
  const agreed = TITLES[titleKey(edge.type, edge.role)]
  if (agreed) return agreed
  return edge.role.split(/\s+/).length <= SHORT_ROLE_WORDS ? edge.role : undefined
}
