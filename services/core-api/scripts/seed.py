#!/usr/bin/env python3
"""
Database seed script for Mosaic Life.

Populates the database with sample users, legacies, and stories for development.
Can be run with: python -m scripts.seed
"""

import asyncio
import os
import sys
from datetime import date
from uuid import uuid4

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models.user import User
from app.models.legacy import Legacy, LegacyMember
from app.models.story import Story


# Sample data
SAMPLE_USERS = [
    {
        "id": uuid4(),
        "email": "demo@mosaiclife.app",
        "google_id": "demo_google_id_001",
        "name": "Demo User",
        "avatar_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
    },
    {
        "id": uuid4(),
        "email": "jennifer.chen@example.com",
        "google_id": "demo_google_id_002",
        "name": "Jennifer Chen",
        "avatar_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
    },
    {
        "id": uuid4(),
        "email": "michael.chen@example.com",
        "google_id": "demo_google_id_003",
        "name": "Michael Chen",
        "avatar_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
    },
]

# Legacy data with associated stories
SAMPLE_DATA = [
    {
        "legacy": {
            "name": "Margaret Chen",
            "birth_date": date(1942, 3, 15),
            "death_date": date(2024, 1, 10),
            "biography": "A loving grandmother who taught us the meaning of resilience. Margaret spent her life bringing joy to others through her famous Sunday morning dumplings and her beautiful garden. She immigrated to the United States in 1965 and built a wonderful life filled with family, community, and love.",
        },
        "stories": [
            {
                "title": "Sunday Morning Dumplings",
                "content": """Grandma always said that the secret to happiness was finding joy in the small things. Every Sunday morning, she would wake up at 5am to prepare her famous dumplings.

The sound of her rolling pin on the marble counter was our alarm clock. She taught each of us how to fold them, patient with our clumsy attempts, laughing when the filling spilled out. "Perfect is boring," she would say.

Those mornings were pure magic. The kitchen would fill with the smell of ginger and garlic, steam rising from the bamboo steamers. We'd gather around the table, three generations, sharing stories and laughter.

I still make her dumplings every Sunday. They're never quite as good as hers, but with each fold, I feel her presence.""",
                "visibility": "public",
            },
            {
                "title": "The Garden Wisdom",
                "content": """I learned more about life from working in Grandma's garden than I did in any classroom. She treated each plant like a child - firm when needed, nurturing always.

"You can't rush growth," she would remind me when I was impatient. "Everything happens in its own time."

Watching her tend to those tomatoes taught me patience, persistence, and the power of daily care. Her garden was more than vegetables - it was her therapy, her meditation, her gift to the neighborhood.

She would send me home with bags of zucchini, peppers, and tomatoes. "Share with the neighbors," she'd say. "Food tastes better when it's shared."

Last summer, I planted my first tomato garden. When I bit into that first ripe tomato, warm from the sun, I understood what she meant about patience.""",
                "visibility": "public",
            },
            {
                "title": "The Letter She Left",
                "content": """After she passed, we found a box in her closet. Inside were letters - one for each of us, written years ago but never sent.

Mine began: "My dearest Jennifer, if you're reading this, I'm dancing with your grandfather now. Don't be sad - be curious. The world is full of wonder if you look closely."

She went on to share her hopes for me, her pride in watching me grow, and her wish that I would always stay curious and kind.

I keep it in my wallet and read it whenever I need courage. Her handwriting, faded now, still carries her voice - warm, wise, and full of love.

She ended with: "Remember, the best stories are the ones we live. Go make beautiful ones."

I'm trying, Grandma. Every day, I'm trying.""",
                "visibility": "private",
            },
        ],
    },
    {
        "legacy": {
            "name": "Robert 'Coach' Martinez",
            "birth_date": date(1958, 7, 22),
            "death_date": None,  # Living tribute - retired
            "biography": "40 years of inspiring young minds. Coach Martinez retired in June 2024 after four decades of teaching history and coaching basketball at Lincoln High School. Known for his unconventional teaching methods and deep care for his students, he turned countless young people into lifelong learners.",
        },
        "stories": [
            {
                "title": "The Constitutional Convention",
                "content": """Coach Martinez didn't just teach history - he made us live it. I'll never forget the day he turned our classroom into a constitutional convention.

He assigned each of us a founding father to research and embody. For three weeks, we debated, argued, and negotiated just as they did in Philadelphia in 1787.

I was James Madison. I had to defend the Virginia Plan against the bigger states. I'd never cared about history before, but suddenly I understood why these debates mattered.

At the end, when we finally ratified our class constitution, Coach stood at the front with tears in his eyes. "This is why I teach," he said. "You just experienced what it means to build something together."

That lesson changed how I see democracy. It's messy, frustrating, and beautiful - just like Coach taught us.""",
                "visibility": "public",
            },
            {
                "title": "After-School Basketball",
                "content": """The gym was always open after school if Coach was there. It didn't matter if you were on the team or not - everyone was welcome.

I was terrible at basketball. Couldn't dribble, couldn't shoot. But Coach kept inviting me back. "It's not about the ball," he'd say. "It's about showing up."

Those afternoons saved me during a rough time at home. The rhythm of the bouncing ball, the squeak of sneakers on the court, Coach's steady encouragement - it was the stability I needed.

Years later, I told him how much those sessions meant to me. He just smiled and said, "I know. That's why I kept the gym open."

He saw what I needed before I could ask for it. That's Coach.""",
                "visibility": "public",
            },
        ],
    },
    {
        "legacy": {
            "name": "Sofia Rodriguez",
            "birth_date": date(2002, 11, 8),
            "death_date": None,  # Living tribute - graduation
            "biography": "First in her family to graduate college. Sofia graduated from State University in 2024 with a degree in Computer Science. Her journey from working two jobs while attending community college to making the Dean's List is an inspiration to her entire family and community.",
        },
        "stories": [
            {
                "title": "The Walk Across the Stage",
                "content": """When Sofia walked across that stage, she wasn't just receiving a diploma - she was opening a door for her entire family.

I watched from the audience, my heart so full it hurt. My daughter, the first in our family to graduate from college. The first to even attend.

Her journey wasn't easy. She worked two jobs while taking classes at community college. She transferred to State University with a full scholarship she earned through sheer determination.

There were nights she wanted to quit. Finals weeks where she survived on coffee and determination. But she never stopped believing.

When they called her name - "Sofia Rodriguez, magna cum laude" - our whole section erupted. We didn't care about decorum. Our girl did it.

She's proof that dreams are worth chasing, no matter how impossible they seem.""",
                "visibility": "public",
            },
        ],
    },
    {
        "legacy": {
            "name": "James Wilson",
            "birth_date": date(1945, 5, 30),
            "death_date": None,  # Living tribute
            "biography": "Living his life with courage and humor. James was diagnosed with early-onset Alzheimer's in 2020. This tribute celebrates his life and preserves his stories while he can still help tell them. Known for his wit, his woodworking, and his unwavering love for his family.",
        },
        "stories": [
            {
                "title": "How We Met (Again)",
                "content": """Even as memories fade, Dad's spirit shines bright. This morning he told me the story of how he met Mom for the "first time" again, and it was just as magical as the first time I heard it.

"I saw her across the dance floor," he said, eyes twinkling. "She had this laugh that filled the whole room. I knew right then I was going to marry her."

He's told me this story hundreds of times now. Each time, he discovers it anew. Each time, his face lights up the same way.

Mom says she falls in love with him again every time he tells it. "The disease took a lot," she says, "but it can't take that look in his eyes when he talks about me."

We're recording his stories now, while we can. This one goes on the list.""",
                "visibility": "public",
            },
            {
                "title": "The Rocking Chair",
                "content": """Dad built a rocking chair for each of his grandchildren. Hand-carved, with their names on the back. It took him months to make each one.

The last one, for his youngest grandson, he finished just before the diagnosis. Some days now he doesn't remember making them. But his hands still know the wood.

Last week, I brought him to his workshop. I handed him a piece of oak. Without a word, he began to sand it, feeling the grain, working the wood like he has for fifty years.

"This is nice wood," he said. "I should make something for the grandkids."

"You already did, Dad."

He smiled. "Well, they can never have too many things made with love."

He's right. They can't.""",
                "visibility": "private",
            },
        ],
    },
]


async def clear_existing_data(session: AsyncSession) -> None:
    """Clear existing seed data (but preserve real user data)."""
    # Delete stories first (foreign key constraint)
    await session.execute(text("DELETE FROM stories WHERE author_id IN (SELECT id FROM users WHERE email LIKE '%example.com' OR email = 'demo@mosaiclife.app')"))
    # Delete legacy members
    await session.execute(text("DELETE FROM legacy_members WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%example.com' OR email = 'demo@mosaiclife.app')"))
    # Delete legacies
    await session.execute(text("DELETE FROM legacies WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%example.com' OR email = 'demo@mosaiclife.app')"))
    # Delete demo users
    await session.execute(text("DELETE FROM users WHERE email LIKE '%example.com' OR email = 'demo@mosaiclife.app'"))
    await session.commit()
    print("✓ Cleared existing seed data")


async def seed_database(db_url: str) -> None:
    """Seed the database with sample data."""
    print("Connecting to database...")

    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Clear existing seed data
        await clear_existing_data(session)

        # Create users
        users = []
        for user_data in SAMPLE_USERS:
            user = User(**user_data)
            session.add(user)
            users.append(user)
        await session.commit()
        print(f"✓ Created {len(users)} users")

        # Use first user as primary creator, others as contributors
        primary_user = users[0]

        # Create legacies and stories
        legacy_count = 0
        story_count = 0

        for data in SAMPLE_DATA:
            # Create legacy
            legacy = Legacy(
                id=uuid4(),
                created_by=primary_user.id,
                **data["legacy"]
            )
            session.add(legacy)
            await session.flush()  # Get the legacy ID

            # Add creator as legacy member
            member = LegacyMember(
                legacy_id=legacy.id,
                user_id=primary_user.id,
                role="creator",
            )
            session.add(member)

            # Add other users as members to first legacy
            if legacy_count == 0:
                for contributor in users[1:]:
                    contributor_member = LegacyMember(
                        legacy_id=legacy.id,
                        user_id=contributor.id,
                        role="member",
                    )
                    session.add(contributor_member)

            legacy_count += 1

            # Create stories for this legacy
            for i, story_data in enumerate(data["stories"]):
                # Rotate authors among available users
                author = users[i % len(users)]
                story = Story(
                    id=uuid4(),
                    legacy_id=legacy.id,
                    author_id=author.id,
                    title=story_data["title"],
                    content=story_data["content"],
                    visibility=story_data["visibility"],
                )
                session.add(story)
                story_count += 1

        await session.commit()
        print(f"✓ Created {legacy_count} legacies")
        print(f"✓ Created {story_count} stories")

    await engine.dispose()
    print("\n✅ Database seeding complete!")


async def main():
    """Main entry point."""
    # Get database URL from environment or use default
    db_url = os.environ.get(
        "DB_URL",
        "postgresql+psycopg://postgres:postgres@localhost:15432/mosaic"
    )

    # Convert to async URL if needed
    if "psycopg://" in db_url and "+psycopg" not in db_url:
        db_url = db_url.replace("psycopg://", "psycopg+psycopg://")

    print("🌱 Mosaic Life Database Seeder")
    print("=" * 40)

    try:
        await seed_database(db_url)
    except Exception as e:
        print(f"\n❌ Error seeding database: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
