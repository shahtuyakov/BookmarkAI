# NestJS Patterns for BookmarkAI

## Service Pattern
```typescript
@Injectable()
export class BookmarkService {
  constructor(
    @InjectRepository(Bookmark)
    private bookmarkRepository: Repository<Bookmark>,
    private eventEmitter: EventEmitter2,
    @InjectQueue('processing') private processingQueue: Queue,
  ) {}

  async create(dto: CreateBookmarkDto): Promise<Bookmark> {
    const bookmark = await this.bookmarkRepository.save(dto);
    
    // Emit event for other services
    this.eventEmitter.emit('bookmark.created', { bookmarkId: bookmark.id });
    
    // Queue for async processing
    await this.processingQueue.add('process-bookmark', { bookmarkId: bookmark.id });
    
    return bookmark;
  }
}
```

## Repository Pattern
```typescript
@Injectable()
export class BookmarkRepository extends Repository<Bookmark> {
  constructor(dataSource: DataSource) {
    super(Bookmark, dataSource.createEntityManager());
  }

  async findWithEmbeddings(userId: string): Promise<Bookmark[]> {
    return this.createQueryBuilder('bookmark')
      .leftJoinAndSelect('bookmark.embeddings', 'embedding')
      .where('bookmark.userId = :userId', { userId })
      .orderBy('bookmark.createdAt', 'DESC')
      .getMany();
  }
}
```

## Error Handling Pattern
```typescript
export class BookmarkNotFoundException extends NotFoundException {
  constructor(bookmarkId: string) {
    super(`Bookmark with ID ${bookmarkId} not found`);
  }
}

// In service
async findOne(id: string): Promise<Bookmark> {
  const bookmark = await this.bookmarkRepository.findOne({ where: { id } });
  if (!bookmark) {
    throw new BookmarkNotFoundException(id);
  }
  return bookmark;
}
```

## DTO Validation Pattern
```typescript
export class CreateBookmarkDto {
  @IsUrl()
  @IsNotEmpty()
  url: string;

  @IsEnum(Platform)
  platform: Platform;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ValidateNested()
  @Type(() => MetadataDto)
  metadata: MetadataDto;
}
```