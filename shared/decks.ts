// Built-in text-only decks. No images are stored: a card is just a label.

export const DECKS: Record<string, string[]> = {
  Animals: [
    'Penguin', 'Giraffe', 'Octopus', 'Sloth', 'Kangaroo', 'Flamingo', 'Hedgehog', 'Shark',
    'Platypus', 'Chameleon', 'Panda', 'Peacock', 'Jellyfish', 'Raccoon', 'Camel', 'Owl',
    'Axolotl', 'Komodo dragon', 'Orangutan', 'Capybara', 'Goldfish', 'Bat', 'Hippo', 'Llama',
  ],
  Characters: [
    'Pikachu', 'Shrek', 'Harry Potter', 'Darth Vader', 'SpongeBob', 'Mario', 'Elsa', 'Batman',
    'Sherlock Holmes', 'Mickey Mouse', 'Gandalf', 'Hello Kitty', 'Spider-Man', 'Homer Simpson',
    'Wonder Woman', 'Sonic', 'Yoda', 'Goku', 'Barbie', 'Kermit the Frog', 'Pac-Man', 'Dora',
    'Winnie the Pooh', 'Naruto',
  ],
  Famous: [
    'Albert Einstein', 'Taylor Swift', 'Cristiano Ronaldo', 'Cleopatra', 'Mona Lisa',
    'Napoleon', 'Michael Jackson', 'Elon Musk', 'Marilyn Monroe', 'Lionel Messi',
    'Leonardo da Vinci', 'Beyoncé', 'Shakespeare', 'Gordon Ramsay', 'Queen Elizabeth II',
    'Bruce Lee', 'Oprah', 'Mr. Bean', 'Abraham Lincoln', 'BTS', 'Dwayne Johnson', 'Frida Kahlo',
  ],
  Food: [
    'Pizza', 'Sushi', 'Durian', 'Croissant', 'Taco', 'Ramen', 'Nasi goreng', 'Pineapple',
    'Hot dog', 'Popcorn', 'Avocado', 'Cheesecake', 'Broccoli', 'Dumpling', 'Bubble tea',
    'Spaghetti', 'Donut', 'Rendang', 'Pancake', 'Watermelon', 'Kimchi', 'Burrito', 'Chili',
  ],
  Jobs: [
    'Astronaut', 'Firefighter', 'Dentist', 'Magician', 'Pilot', 'Chef', 'Lifeguard',
    'Detective', 'Plumber', 'Ballerina', 'Pirate', 'Farmer', 'DJ', 'Librarian', 'Surgeon',
    'Clown', 'Barista', 'Zookeeper', 'Ninja', 'Mime', 'Tattoo artist', 'Influencer',
  ],
};

// Shown to the wearer as a category hint for deck cards.
export const DECK_HINTS: Record<string, string> = {
  Animals: 'Animal',
  Characters: 'Fictional character',
  Famous: 'Famous person or thing',
  Food: 'Food',
  Jobs: 'Job',
};

export function randomDeckCard(deck?: string): { label: string; hint: string } {
  const names = Object.keys(DECKS);
  const name = deck && DECKS[deck] ? deck : names[Math.floor(Math.random() * names.length)];
  const cards = DECKS[name];
  return { label: cards[Math.floor(Math.random() * cards.length)], hint: DECK_HINTS[name] ?? '' };
}
